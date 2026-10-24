import {create} from 'zustand';
import type {AcceptanceCriterion,Task} from './types';
import type {TaskStatus} from './config';
import {readData,writeData} from './dataApi';
type State={tasks:Task[];loading:boolean;notice:string;error:string;load:()=>Promise<void>;create:(task:Task)=>Promise<void>;update:(id:string,patch:Partial<Task>)=>Promise<void>;remove:(id:string)=>Promise<void>;move:(id:string,status:string)=>Promise<void>};
let taskStatePaused = false;
let queuedTasks: Task[] | null = null;
let taskOperation = Promise.resolve();
const publishTasks = (set: (value: Partial<State>) => void, tasks: Task[]) => {
  if (taskStatePaused) queuedTasks = tasks;
  else set({ tasks });
};
const publishNotice = (set: (value: Partial<State>) => void, notice: string) => {
  if (!taskStatePaused) set({ notice });
};
export const pauseTaskStateUpdates = () => { taskStatePaused = true; };
export const flushTaskStateUpdates = () => {
  taskStatePaused = false;
  if (queuedTasks) { useTaskStore.setState({ tasks: queuedTasks }); queuedTasks = null; }
};
export const normalizeCriteria=(value:Task['acceptance_criteria']):AcceptanceCriterion[]=>{const values=Array.isArray(value)?value:[value];return values.flatMap((item,index)=>{if(typeof item==='string'){const text=item.trim();return text?[{id:`criterion-${index+1}`,text,completed:false}]:[]} ;return item&&item.text?.trim()?[{id:item.id||`criterion-${index+1}`,text:item.text.trim(),completed:Boolean(item.completed)}]:[]})};
const normalizeTask=(task:Task):Task=>({...task,acceptance_criteria:normalizeCriteria(task.acceptance_criteria)});
const enqueue = (operation: () => Promise<void>) => {
  const next = taskOperation.then(operation, operation);
  taskOperation = next.catch(() => undefined);
  return next;
};
const optimisticWrite = async (set: (value: Partial<State>) => void, get: () => State, nextTasks: Task[], notice: string) => {
  const previousTasks = get().tasks;
  publishTasks(set, nextTasks);
  try {
    await writeData('tasks.json', nextTasks);
    if (notice) publishNotice(set, notice);
  } catch (error) {
    publishTasks(set, previousTasks);
    set({ error: (error as Error).message });
  }
};
// Task writes remain silent while the drawer is open; this prevents a notice
// update from causing an unnecessary render during sidebar interaction.
export const useTaskStore = create<State>((set, get) => ({
  tasks: [], loading: false, notice: '', error: '',
  load: () => enqueue(async () => {
    set({ loading: true, error: '' });
    try { publishTasks(set, (await readData<Task[]>('tasks.json')).map(normalizeTask)); }
    catch (e) { set({ error: (e as Error).message }); }
    finally { set({ loading: false }); }
  }),
  create: task => enqueue(async () => optimisticWrite(set, get, [...(queuedTasks ?? get().tasks), normalizeTask(task)], 'Task created')),
  update: (id, patch) => enqueue(async () => optimisticWrite(set, get, (queuedTasks ?? get().tasks).map(task => task.task_id === id ? normalizeTask({ ...task, ...patch }) : task), 'Task updated')),
  remove: id => enqueue(async () => optimisticWrite(set, get, (queuedTasks ?? get().tasks).filter(task => task.task_id !== id), 'Task deleted')),
  move: (id, status) => enqueue(async () => optimisticWrite(set, get, (queuedTasks ?? get().tasks).map(task => task.task_id === id ? { ...task, status: status as TaskStatus } : task), '' )),
}));
