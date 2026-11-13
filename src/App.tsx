import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import {
  Menu,
  MoreVertical,
  Plus,
  RefreshCw,
  Trash2,
  X,
  Edit3,
  Eye,
  Bold,
  Underline,
} from "lucide-react";
import { config, type Board, type TaskStatus } from "./config";
import { flushTaskStateUpdates, pauseTaskStateUpdates, useTaskStore } from "./store";
import { readData, writeData, subscribeToTaskChanges } from "./dataApi";
import type { AcceptanceCriterion, Task } from "./types";
import "./index.css";

const TaskCard = memo(({
  task,
  position,
  onOpen,
  onDragStart,
  onDragEnd,
  onPointerStart,
}: {
  task: Task;
  position: { x: number; y: number };
  onOpen: (task: Task, element: HTMLElement) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  onPointerStart: (taskId: string, x: number, y: number) => void;
}) => (
  <article
    draggable={false}
    tabIndex={0}
    onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; onDragStart(task.task_id); }}
    onDragEnd={onDragEnd}
    onPointerDown={(event) => { if ((event.target as HTMLElement).closest("button")) return; onPointerStart(task.task_id, event.clientX, event.clientY); }}
    className="task-card note-card min-w-0 cursor-pointer rounded-lg border p-3 outline-none hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-blue-300" style={{ position: "absolute", left: position.x, top: position.y, width: 300, backgroundColor: task.color || defaultNoteColor, borderColor: "#00000022", color: "#263238" }}
  >
    <div className="note-card-heading"><h3 className="font-medium" title={task.name}>{task.name}</h3><button type="button" className="note-menu icon" aria-label={"Opciones de " + task.name} title="Opciones" onClick={(event) => { event.stopPropagation(); onOpen(task, event.currentTarget); }}><MoreVertical size={18} /></button></div>
  </article>
));

const noteColors = [{ value: "#fff1a8", label: "Sol" }, { value: "#ffd6a5", label: "Durazno" }, { value: "#ffadad", label: "Coral" }, { value: "#caffbf", label: "Menta" }, { value: "#bde0fe", label: "Cielo" }, { value: "#d9c2ff", label: "Lavanda" }];
const defaultNoteColor = noteColors[0].value;
const empty = {
  task_id: "",
  name: "",
  description: "",
  acceptance_criteria: "",
  status: "backlog" as TaskStatus,
  color: defaultNoteColor,
};
const storedWidth = (): number => {
  const value = Number(localStorage.getItem(config.sidebarStorageKey));
  const minWidth = window.innerWidth * 0.2;
  return Number.isFinite(value) && value >= minWidth && value <= window.innerWidth
    ? value
    : config.defaultSidebarWidth;
};
const renderCriterionText = (value: string) => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/__(.+?)__/g, "<u>$1</u>");
const boardColors = [
  "#9aa3ad",
  "#9b8ab8",
  "#c5ad68",
  "#78a58a",
  "#c28b5b",
  "#6aa6c9",
  "#c77d9b",
];
const readBoards = (): Board[] => [...config.statuses];

export default function App() {
  const tasks = useTaskStore((state) => state.tasks);
  const { loading, error, notice } = useTaskStore(useShallow((state) => ({
    loading: state.loading,
    error: state.error,
    notice: state.notice,
  })));
  // Actions are stable Zustand store members. Reading them through getState
  // avoids subscribing App to action references and keeps state subscriptions
  // limited to the data actually rendered here.
  const { load, move, create, update, remove } = useTaskStore.getState();
  const [selected, setSelected] = useState<Task | null>(null);
  // Visibility is explicit: task data/edit state may change without closing the sidebar.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [taskDialog, setTaskDialog] = useState(false);
  const [form, setForm] = useState(empty);
  const [criterionDrafts, setCriterionDrafts] = useState<AcceptanceCriterion[]>([]);
  // While the drawer is open the store batches task publications to avoid
  // rerendering the board. Keep the criteria slice responsive locally.
  const [criteriaOverride, setCriteriaOverride] = useState<{
    taskId: string;
    items: AcceptanceCriterion[];
  } | null>(null);
  const [statusOverride, setStatusOverride] = useState<{
    taskId: string;
    status: TaskStatus;
  } | null>(null);
  const [width, setWidth] = useState<number>(storedWidth);
  const [drag, setDrag] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsAnchor, setActionsAnchor] = useState({ top: 0, left: 0 });
  const [criterionEditing, setCriterionEditing] = useState<AcceptanceCriterion | null>(null);
  const [criterionDeleting, setCriterionDeleting] = useState<AcceptanceCriterion | null>(null);
  const [criterionDraft, setCriterionDraft] = useState("");
  const [criterionViewing, setCriterionViewing] = useState<AcceptanceCriterion | null>(null);
  const [criterionMenu, setCriterionMenu] = useState<string | null>(null);
  const [criterionAnchor, setCriterionAnchor] = useState({ top: 0, left: 0 });
  const criterionMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const criterionPortalRef = useRef<HTMLDivElement | null>(null);
  const criterionTextRef = useRef<HTMLTextAreaElement | null>(null);
  const [boardMenu, setBoardMenu] = useState<string | null>(null);
  const [boardDialog, setBoardDialog] = useState<{ mode: "create" | "edit"; board?: Board; label: string; accent: string } | null>(null);
  const [boardToDelete, setBoardToDelete] = useState<Board | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [criterionDialog, setCriterionDialog] = useState<{ mode: "edit" | "delete"; item: AcceptanceCriterion; value: string } | null>(null);
  const [boards, setBoards] = useState<Board[]>(readBoards);
  const triggerRef = useRef<HTMLElement | null>(null);
  // Keep refreshes from replacing the task collection during drawer interaction.
  const deferredLoadRef = useRef(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const drawerOpen = sidebarOpen || Boolean(editing) || taskDialog;
  useEffect(() => {
    if (drawerOpen) pauseTaskStateUpdates();
    else flushTaskStateUpdates();
  }, [drawerOpen]);
  // Subscribe the detail sidebar only to the task it displays. Updates to other
  // cards no longer force the popup state/markup through this selector.
  const selectedTask = useTaskStore((state) => selected
    ? (state.tasks.find((task) => task.task_id === selected.task_id) ?? selected)
    : null);
  // Keep the detail sidebar mounted across store-driven renders. The explicit
  // close action clears `selected`, so this does not undo an intentional close.
  useEffect(() => {
    if (selected && selectedTask && !sidebarOpen && !taskDialog && !editing) {
      setSidebarOpen(true);
    }
  }, [selected, selectedTask, sidebarOpen, taskDialog, editing]);
  useEffect(() => {
    if (!selectedTask || statusOverride?.taskId !== selectedTask.task_id) return;
    if (selectedTask.status === statusOverride.status) setStatusOverride(null);
  }, [selectedTask?.task_id, selectedTask?.status, statusOverride]);
  const generateTaskId = useCallback(() => {
    const used = new Set(tasks.map((task) => task.task_id));
    let candidate = `TASK-${Date.now()}`;
    let suffix = 1;
    while (used.has(candidate)) candidate = `TASK-${Date.now()}-${suffix++}`;
    return candidate;
  }, [tasks]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const unsubscribe = subscribeToTaskChanges(() => {
      if (drawerOpen) deferredLoadRef.current = true;
      else void useTaskStore.getState().load();
    });
    return unsubscribe;
  }, [drawerOpen]);
  useEffect(() => {
    void Promise.all([readData<Board[]>("boards.json"), readData<{ sidebarWidth?: number }>("preferences.json")]).then(([savedBoards, preferences]) => {
      setBoards(savedBoards.length ? savedBoards : [...config.statuses]);
      const nextWidth = Number(preferences.sidebarWidth);
      const minWidth = window.innerWidth * 0.2;
      if (Number.isFinite(nextWidth)) setWidth(Math.min(window.innerWidth, Math.max(minWidth, nextWidth)));
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useTaskStore.setState({ notice: "" }), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!drawerOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (editing) setEditing(null);
      else if (taskDialog) setTaskDialog(false);
      else close();
    };
    addEventListener("keydown", onKey);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", onKey);
      document.body.style.overflow = old;
    };
  }, [drawerOpen, editing, taskDialog]);
  useEffect(() => {
    if (!taskDialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTaskDialog(false);
        setCriterionMenu(null);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [taskDialog]);
  useEffect(() => {
    if (!criterionMenu) return;
    const closeMenu = (event: MouseEvent) => {
      const activeMenu = criterionMenu ? criterionMenuRefs.current[criterionMenu] : null;
      const target = event.target as Node;
      if (!activeMenu?.contains(target) && !criterionPortalRef.current?.contains(target)) {
        setCriterionMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCriterionMenu(null);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [criterionMenu]);
  const open = (
    task?: Task,
    status: TaskStatus = "backlog",
    trigger?: HTMLElement | null,
  ) => {
    triggerRef.current = trigger ?? null;
    setEditing(task || null);
    setTaskDialog(!task);
    setForm(
      task
        ? {
            ...task,
            color: task.color || defaultNoteColor,
            acceptance_criteria: (Array.isArray(task.acceptance_criteria)
              ? task.acceptance_criteria
              : []
            )
              .map((item) => (typeof item === "string" ? item : item.text))
              .join("\n"),
          }
        : { ...empty, task_id: generateTaskId(), status },
    );
    setCriterionDrafts(task
      ? (Array.isArray(task.acceptance_criteria) ? task.acceptance_criteria : [])
          .map((item, index) => typeof item === "string" ? { id: `criterion-${index + 1}`, text: item, completed: false } : item)
      : []);
    // Preserve the selected detail while the edit popup is open.
    if (task) {
      setSelected(task);
      setSidebarOpen(true);
    }
    setActionsOpen(false);
  };
  const close = () => {
    setSidebarOpen(false);
    setSelected(null);
    setCriteriaOverride(null);
    setStatusOverride(null);
    setEditing(null);
    setTaskDialog(false);
    setActionsOpen(false);
    setBoardMenu(null);
    setCriterionEditing(null);
    setCriterionDeleting(null);
    setCriterionViewing(null);
    setCriterionMenu(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
    if (deferredLoadRef.current) {
      deferredLoadRef.current = false;
      void load();
    }
  };
  const refresh = () => {
    if (drawerOpen) {
      deferredLoadRef.current = true;
      return;
    }
    void load();
  };
  const closeTaskForm = () => {
    setEditing(null);
    setTaskDialog(false);
    setCriterionEditing(null);
    setCriterionDeleting(null);
    setCriterionViewing(null);
    setCriterionMenu(null);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = {
      ...form,
      task_id: editing ? form.task_id : generateTaskId(),
      acceptance_criteria: criterionDrafts
        .map((item) => item.text.trim())
        .filter(Boolean),
      position: editing?.position || { x: 40, y: 40 },
    };
    try {
      if (editing) {
        await update(editing.task_id, {
          task_id: form.task_id,
          name: form.name,
          description: form.description,
          acceptance_criteria: value.acceptance_criteria,
          color: form.color || defaultNoteColor,
        });
        setSelected((current) => current ? { ...current, task_id: form.task_id, name: form.name, description: form.description, color: form.color || defaultNoteColor } : current);
      } else {
        await create(value);
        // Close the creation modal after a successful create.
        setTaskDialog(false);
      }
      setEditing(null);
      setTaskDialog(false);
    } catch {
      /* Keep the error visible after refresh. */
    }
  };
  const moveTask = async (id: string, status: TaskStatus) => {
    setStatusOverride({ taskId: id, status });
    try {
      await move(id, status);
    } finally {
      setDrag(null);
    }
  };
  const selectedStatus = selectedTask && statusOverride?.taskId === selectedTask.task_id
    ? statusOverride.status
    : selectedTask?.status;
  const saveBoards = (next: Board[]) => {
    setBoards(next);
    void writeData("boards.json", next);
  };
  const openBoardDialog = (board?: Board) => {
    setBoardDialog(board ? { mode: "edit", board, label: board.label, accent: board.accent } : { mode: "create", label: "", accent: boardColors[boards.length % boardColors.length] });
    setBoardMenu(null);
  };
  const saveBoard = (event: React.FormEvent) => {
    event.preventDefault();
    const label = boardDialog?.label.trim();
    if (!label || !boardDialog) return;
    if (boardDialog.mode === "edit" && boardDialog.board) {
      if (label === boardDialog.board.label && boardDialog.accent === boardDialog.board.accent) {
        setBoardDialog(null);
        return;
      }
      saveBoards(boards.map((item) => item.value === boardDialog.board!.value ? { ...item, label, accent: boardDialog.accent } : item));
      setBoardDialog(null);
      return;
    }
    const value =
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `board-${Date.now()}`;
    if (boards.some((board) => board.value === value)) {
      alert("A board with that name already exists");
      return;
    }
    saveBoards([
      ...boards,
      { value, label, accent: boardDialog.accent },
    ]);
    setBoardDialog(null);
  };
  const deleteBoard = async (board: Board) => {
    if (boards.length <= 1) {
      alert("At least one board must exist");
      return;
    }
    const target = boards.find((item) => item.value !== board.value)!;
    for (const task of tasks.filter((item) => item.status === board.value))
      await move(task.task_id, target.value);
    saveBoards(boards.filter((item) => item.value !== board.value));
    setBoardToDelete(null);
  };
  const criteria = useMemo<AcceptanceCriterion[]>(() =>
    selectedTask && criteriaOverride?.taskId === selectedTask.task_id
      ? criteriaOverride.items
      : selectedTask && Array.isArray(selectedTask.acceptance_criteria)
      ? selectedTask.acceptance_criteria.map((item, index) =>
          typeof item === "string"
            ? { id: `legacy-${index}`, text: item, completed: false }
            : item,
        )
      : [], [selectedTask, criteriaOverride]);
  const criteriaRef = useRef<AcceptanceCriterion[]>(criteria);
  useEffect(() => {
    criteriaRef.current = criteria;
  }, [selectedTask?.task_id, selectedTask?.acceptance_criteria]);
  const updateCriteria = async (next: AcceptanceCriterion[]) => {
    criteriaRef.current = next;
    if (selectedTask) {
      setCriteriaOverride({ taskId: selectedTask.task_id, items: next });
      await update(selectedTask.task_id, { acceptance_criteria: next });
    }
  };
  const activeCriteria = useMemo(
    () => taskDialog ? criterionDrafts : criteria,
    [criteria, criterionDrafts, taskDialog],
  );
  const boardColumns = useMemo(
    () => boards.map((board) => ({
      board,
      tasks: tasks.filter((task) => task.status === board.value),
    })),
    [boards, tasks],
  );
  const wallRef = useRef<HTMLDivElement | null>(null);
  const freeTasks = useMemo(() => tasks.map((task, index) => ({ task, position: task.position || { x: 80 + (index % 6) * 560, y: 100 + Math.floor(index / 6) * 300 } })), [tasks]);
  const pointerGestureRef = useRef<{ taskId: string; startX: number; startY: number; active: boolean } | null>(null);
  const pointerPositionRef = useRef<{ taskId: string; position: { x: number; y: number } } | null>(null);
  const [pointerPosition, setPointerPosition] = useState<{ taskId: string; position: { x: number; y: number } } | null>(null);
  const handlePointerStart = useCallback((taskId: string, clientX: number, clientY: number) => { pointerGestureRef.current = { taskId, startX: clientX, startY: clientY, active: false }; }, []);
  useEffect(() => {
    const move = (event: PointerEvent) => { const gesture = pointerGestureRef.current; const canvas = wallRef.current; const rect = canvas?.getBoundingClientRect(); if (!gesture || !canvas || !rect) return; const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY); if (!gesture.active && distance < 10) return; gesture.active = true; event.preventDefault(); setDrag(gesture.taskId); const scroller = canvas.parentElement; const next = { taskId: gesture.taskId, position: { x: Math.max(24, Math.min(3516, event.clientX - rect.left + (scroller?.scrollLeft || 0) - 150)), y: Math.max(40, Math.min(2040, event.clientY - rect.top + (scroller?.scrollTop || 0) - 30)) } }; pointerPositionRef.current = next; setPointerPosition(next); };
    const up = async () => { const gesture = pointerGestureRef.current; pointerGestureRef.current = null; const next = pointerPositionRef.current; pointerPositionRef.current = null; setPointerPosition(null); setDrag(null); if (gesture?.active && next) await useTaskStore.getState().update(next.taskId, { position: next.position }); };
    window.addEventListener("pointermove", move, { passive: false }); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up); return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, []);
  const placeTask = async (event: React.DragEvent<HTMLDivElement>) => { if (!drag || !wallRef.current) return; const rect = wallRef.current.getBoundingClientRect(); const x = Math.max(24, Math.min(3516, event.clientX - rect.left + (wallRef.current.parentElement?.scrollLeft || 0) - 150)); const y = Math.max(40, Math.min(2040, event.clientY - rect.top + (wallRef.current.parentElement?.scrollTop || 0) - 30)); await update(drag, { position: { x, y } }); setDrag(null); };
  const openTask = useCallback((task: Task, element: HTMLElement) => {
    triggerRef.current = element;
    setSidebarOpen(true);
    setSelected(task);
    setActionsOpen(false);
  }, []);
  const startTaskDrag = useCallback((taskId: string) => setDrag(taskId), []);
  const endTaskDrag = useCallback(() => setDrag(null), []);
  const updateActiveCriteria = async (next: AcceptanceCriterion[]) => {
    if (taskDialog) setCriterionDrafts(next);
    else await updateCriteria(next);
  };
  const addCriterion = async (text: string) => {
    const value = text.trim();
    if (value)
      await updateCriteria([
        ...criteriaRef.current,
        { id: `criterion-${Date.now()}`, text: value, completed: false },
      ]);
  };
  const toggleCriterion = async (id: string) =>
    updateCriteria(
      criteriaRef.current.map((item) => ({
        ...item,
        completed: item.id === id ? !item.completed : item.completed,
      })),
    );
  const editCriterion = (item: AcceptanceCriterion) => {
    setCriterionEditing(item);
    setCriterionDraft(item.text);
  };
  const saveCriterion = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = criterionDraft.trim();
    if (!criterionEditing || !value) return;
    await updateActiveCriteria(activeCriteria.map((current) => current.id === criterionEditing.id ? { ...current, text: value } : current));
    setCriterionEditing(null);
  };
  const deleteCriterion = (item: AcceptanceCriterion) => setCriterionDeleting(item);
  const applyCriterionFormat = (opening: string, closing: string) => {
    const textarea = criterionTextRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return;
    const selected = criterionDraft.slice(start, end);
    const next = criterionDraft.slice(0, start) + opening + selected + closing + criterionDraft.slice(end);
    setCriterionDraft(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + opening.length, start + opening.length + selected.length);
    });
  };
  const confirmDeleteCriterion = async () => {
    if (!criterionDeleting) return;
    await updateActiveCriteria(activeCriteria.filter((item) => item.id !== criterionDeleting.id));
    setCriterionDeleting(null);
  };
  return (
    <main className="mx-auto flex h-[100dvh] max-w-[1600px] flex-col overflow-hidden p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5 md:p-10">
      {!drag && <header className="fixed right-6 top-6 z-30"><button className="icon add-task-button" aria-label="Agregar tarea" title="Agregar tarea" onClick={(event) => open(undefined, "backlog", event.currentTarget)}><Plus size={24} /></button></header>}
      {(error || notice) && (
        <p
          role="status"
          className={error ? "toast-notification error" : "toast-notification success"}
        >
          {error || notice}
        </p>
      )}
      {loading ? (
        <div className="min-h-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/60 p-5 text-sm text-slate-400">
          Loading tasks…
        </div>
      ) : (
        <section aria-label="Pizarra de tareas" className="wall-viewport min-h-0 flex-1"><div ref={wallRef} className="wall-canvas" onDragOver={(event) => event.preventDefault()} onDrop={(event) => void placeTask(event)}>{freeTasks.map(({ task, position }) => <TaskCard key={task.task_id} task={task} position={pointerPosition?.taskId === task.task_id ? pointerPosition.position : position} onOpen={openTask} onDragStart={startTaskDrag} onDragEnd={endTaskDrag} onPointerStart={handlePointerStart} />)}</div></section>
      )}
      {boardToDelete && (
        <div className="modal-overlay fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setBoardToDelete(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="board-delete-title" className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
            <div className="grid gap-4">
              <h2 id="board-delete-title" className="text-lg font-bold">Delete board</h2>
              <p className="text-slate-300">Are you sure you want to delete “{boardToDelete.label}”? Tasks will move to the first available board.</p>
              <div className="flex justify-end gap-2"><button type="button" className="rounded border border-red-400 px-4 py-2 font-medium text-red-300 hover:bg-red-950" onClick={() => setBoardToDelete(null)}>Cancel</button><button type="button" className="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500" onClick={() => void deleteBoard(boardToDelete)}>Delete</button></div>
            </div>
          </div>
        </div>
      )}
      {taskToDelete && (
        <div className="modal-overlay fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setTaskToDelete(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="task-delete-title" className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
            <div className="grid gap-4">
              <h2 id="task-delete-title" className="text-lg font-bold">Delete task</h2>
              <p className="text-slate-300">Are you sure you want to delete “{taskToDelete.name}”?</p>
              <div className="flex justify-end gap-2"><button type="button" className="rounded border border-red-400 px-4 py-2 font-medium text-red-300 hover:bg-red-950" onClick={() => setTaskToDelete(null)}>Cancel</button><button type="button" className="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500" onClick={async () => { await remove(taskToDelete.task_id); setTaskToDelete(null); close(); }}>Delete</button></div>
            </div>
          </div>
        </div>
      )}
      {boardDialog && (
        <div className="modal-overlay fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setBoardDialog(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="board-popup-title" className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
            <form onSubmit={saveBoard} className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <h2 id="board-popup-title" className="text-lg font-bold">{boardDialog.mode === "create" ? "Create board" : "Edit board"}</h2>
                <button type="button" className="icon" aria-label="Close" title="Close" onClick={() => setBoardDialog(null)}><X size={18} /></button>
              </div>
              <label className="grid gap-1 text-sm text-slate-300">
                Board name
                <input autoFocus required value={boardDialog.label} onChange={(event) => setBoardDialog({ ...boardDialog, label: event.target.value })} className="w-full rounded border border-slate-700 bg-slate-950 p-2" />
              </label>
              <div className="flex items-center justify-between gap-3 text-sm text-slate-300">
                Accent color
                <span className="flex items-center gap-2">
                  <input type="color" aria-label="Color de acento" value={boardDialog.accent} onChange={(event) => setBoardDialog({ ...boardDialog, accent: event.target.value })} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className="h-9 w-14 cursor-pointer rounded border border-slate-700 bg-slate-950 p-1" />
                  <code className="text-xs text-slate-400">{boardDialog.accent}</code>
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded border border-red-400 px-4 py-2 font-medium text-red-300 hover:bg-red-950" onClick={() => setBoardDialog(null)}>Cancel</button>
                <button type="submit" className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-500">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {taskDialog && (
        <div className="modal-overlay fixed inset-0 z-30 grid place-items-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeTaskForm(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="task-create-title" className="flex max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
            <form id="task-create-form" onSubmit={save} className="grid min-h-0 gap-4 overflow-y-auto overscroll-contain pr-1">
              <div className="flex items-center justify-between gap-3">
                <h2 id="task-create-title" className="text-lg font-bold">Add task</h2>
                <button type="button" className="icon" aria-label="Close" title="Close" onClick={closeTaskForm}><X size={18} /></button>
              </div>
              <label className="task-id-field grid gap-1 text-sm text-slate-300">
                Task ID
                <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950 p-2 text-slate-300"><span className="font-mono">{form.task_id}</span><span className="ml-auto text-xs text-slate-500">Generated automatically</span></div>
              </label>
              <label className="grid gap-1 text-sm text-slate-300">
                Name
                <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded border border-slate-700 bg-slate-950 p-2" />
              </label>
              <fieldset className="grid gap-2 text-sm text-slate-300"><legend>Note color</legend><div className="note-color-picker" role="radiogroup" aria-label="Note color">{noteColors.map((noteColor) => <button key={noteColor.value} type="button" className="note-color-swatch" style={{ backgroundColor: noteColor.value }} aria-label={noteColor.label} aria-pressed={form.color === noteColor.value} onClick={() => { setForm({ ...form, color: noteColor.value }); setSelected((current) => current ? { ...current, color: noteColor.value } : current); }} />)}</div></fieldset>
              <label className="grid gap-1 text-sm text-slate-300">
                Description
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="w-full resize-y rounded border border-slate-700 bg-slate-950 p-2" />
              </label>
              <div className="status-field grid gap-2 text-sm text-slate-300">
                <span>Initial status</span>
                <div className="flex items-center gap-2 rounded border px-3 py-2" style={{ color: boards.find((board) => board.value === form.status)?.accent, borderColor: boards.find((board) => board.value === form.status)?.accent, backgroundColor: `${boards.find((board) => board.value === form.status)?.accent}18` }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: boards.find((board) => board.value === form.status)?.accent }} />
                  <strong>{boards.find((board) => board.value === form.status)?.label ?? form.status}</strong>
                  <span className="ml-auto text-xs text-slate-400">Tasks will be added here</span>
                </div>
              </div>
              <div className="criteria-section grid gap-2 text-sm text-slate-300">
                <span>Acceptance criteria</span>
                <span className="text-xs text-slate-500">Each criterion can be added and edited separately.</span>
                <div className="flex gap-2">
                  <input name="new-task-criterion" aria-label="New acceptance criterion" placeholder="Add criterion…" className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 p-2 text-sm" />
                  <button type="button" className="icon shrink-0" aria-label="Add criterion" title="Add criterion" onClick={(event) => { const input = event.currentTarget.previousElementSibling as HTMLInputElement; const text = input.value.trim(); if (!text) return; setCriterionDrafts([...criterionDrafts, { id: `criterion-${Date.now()}`, text, completed: false }]); input.value = ""; }}><Plus size={18} /></button>
                </div>
                <div className="grid gap-2">
                  {criterionDrafts.map((criterion, index) => <div key={criterion.id} className="flex items-center gap-2"><span className="w-5 text-center text-xs text-slate-500">{index + 1}</span><span className="min-w-0 flex-1 truncate" dangerouslySetInnerHTML={{ __html: renderCriterionText(criterion.text) }} /><button type="button" className="icon" aria-label={`More options for: ${criterion.text}`} aria-expanded={criterionMenu === criterion.id} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setCriterionAnchor({ top: rect.bottom + 4, left: Math.max(8, rect.right - 160) }); setCriterionMenu(criterionMenu === criterion.id ? null : criterion.id); }}><MoreVertical size={18} /></button>{criterionMenu === criterion.id && createPortal(<div ref={criterionPortalRef} role="menu" className="fixed z-[100] grid min-w-40 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl" style={criterionAnchor} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><button role="menuitem" className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-blue-300 hover:bg-slate-800" onClick={() => { setCriterionMenu(null); setCriterionViewing(criterion); }}><Eye size={15} />View</button><button role="menuitem" className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-yellow-300 hover:bg-slate-800" onClick={() => { setCriterionMenu(null); editCriterion(criterion); }}><Edit3 size={15} />Edit</button><button role="menuitem" className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-slate-800" onClick={() => { setCriterionMenu(null); deleteCriterion(criterion); }}><Trash2 size={15} />Delete</button></div>, document.body)}</div>)}
                  {!criterionDrafts.length && <p className="rounded border border-dashed border-slate-700 p-3 text-center text-xs text-slate-500">No criteria yet.</p>}
                </div>
              </div>
            </form>
            <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-slate-700 pt-4">
              <button type="button" className="rounded border border-red-400 px-4 py-2 font-medium text-red-300 hover:bg-red-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300" onClick={closeTaskForm}>Cancel</button>
              <button type="submit" form="task-create-form" className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-500">Add task</button>
            </div>
          </div>
        </div>
      )}
      {(sidebarOpen || taskDialog) && (
        <>
          <div
            className="fixed inset-0 z-10 bg-black/50"
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={editing ? "Edit task" : "Task details"}
            className={taskDialog ? "contents" : "task-sidebar fixed right-0 top-0 z-20 flex h-[100dvh] max-h-[100dvh] max-w-full flex-col overflow-y-auto border-l border-slate-600 bg-slate-900 p-4 shadow-2xl sm:p-6"}
            style={taskDialog ? undefined : ({ width: Math.min(width, innerWidth), "--task-sidebar-color": selected?.color || selectedTask?.color || defaultNoteColor } as React.CSSProperties)}
          >

            {(criterionEditing || criterionDeleting || criterionViewing) && (
              <div className="modal-overlay fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
                <div role="dialog" aria-modal="true" aria-labelledby="criterion-popup-title" className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
                  {criterionViewing ? (
                    <div className="grid gap-4">
                      <div className="flex items-center justify-between gap-3"><h2 id="criterion-popup-title" className="text-lg font-bold">View criterion</h2><button type="button" className="icon" aria-label="Close" onClick={() => setCriterionViewing(null)}><X size={18} /></button></div>
                      <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-slate-200" dangerouslySetInnerHTML={{ __html: renderCriterionText(criterionViewing.text) }} />
                      <div className="flex justify-end"><button type="button" className="rounded border border-slate-600 px-4 py-2 text-slate-200 hover:bg-slate-800" onClick={() => setCriterionViewing(null)}>Close</button></div>
                    </div>
                  ) : criterionEditing ? (
                    <form onSubmit={saveCriterion} className="grid gap-4">
                      <div className="flex items-center justify-between gap-3"><h2 id="criterion-popup-title" className="text-lg font-bold">Edit criterion</h2><button type="button" className="icon" aria-label="Close" onClick={() => setCriterionEditing(null)}><X size={18} /></button></div>
                      <div className="flex items-center justify-end gap-1 rounded border border-slate-700 bg-slate-950 p-2" aria-label="Text formatting"><button type="button" className="icon" aria-label="Apply bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => applyCriterionFormat("**", "**")}><Bold size={17} /></button><button type="button" className="icon" aria-label="Apply underline" title="Underline" onMouseDown={(event) => event.preventDefault()} onClick={() => applyCriterionFormat("__", "__")}><Underline size={17} /></button></div>
                      <textarea ref={criterionTextRef} autoFocus value={criterionDraft} onChange={(event) => setCriterionDraft(event.target.value)} aria-label="Criterion text" required rows={6} className="w-full resize-y rounded border border-slate-700 bg-slate-950 p-2" />
                      <div className="flex justify-end gap-2"><button type="button" className="rounded border border-red-400 px-4 py-2 font-medium text-red-300 hover:bg-red-950" onClick={() => setCriterionEditing(null)}>Cancel</button><button type="submit" className="rounded bg-yellow-400 px-4 py-2 font-medium text-slate-950 hover:bg-yellow-300">Save</button></div>
                    </form>
                  ) : (
                    <div className="grid gap-4"><h2 id="criterion-popup-title" className="text-lg font-bold">Delete criterion</h2><p className="text-slate-300">Are you sure you want to delete “{criterionDeleting?.text}”?</p><div className="flex justify-end gap-2"><button type="button" className="rounded border border-red-400 px-4 py-2 font-medium text-red-300 hover:bg-red-950" onClick={() => setCriterionDeleting(null)}>Cancel</button><button type="button" className="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500" onClick={() => void confirmDeleteCriterion()}>Delete</button></div></div>
                  )}
                </div>
              </div>
            )}
            {selected && (
              <div className="task-id-meta mb-6 flex items-center justify-between gap-3 border-b border-slate-700 pb-3 pt-10 text-xs text-slate-400">
                <div className="task-id-value min-w-0 truncate">
                  <span className="font-semibold uppercase tracking-wide text-blue-300">
                    ID
                  </span>
                  <span className="ml-2 font-mono text-slate-300">
                    {selectedTask?.task_id}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    aria-label="Cambiar estado"
                    className="status-select status-select-compact shrink-0 rounded border p-1.5 text-xs"
                    style={{
                      color: boards.find((s) => s.value === selectedStatus)?.accent,
                      borderColor: boards.find((s) => s.value === selectedStatus)?.accent,
                      backgroundColor: `${boards.find((s) => s.value === selectedStatus)?.accent}22`,
                    }}
                    value={selectedStatus}
                    onChange={(event) => void moveTask(selectedTask!.task_id, event.target.value as TaskStatus)}
                  >
                    {boards.map((s) => <option key={s.value} value={s.value} style={{ color: s.accent, backgroundColor: "#0f172a" }}>{s.label}</option>)}
                  </select>

                </div>
              </div>
            )}
            <div className="mb-4 flex items-start justify-between gap-3">
              {selected && (
                <div className="min-w-0 flex-1">
                  <div className="task-detail-heading flex min-w-0 items-center gap-3">
                    <h2
                      className="min-w-0 flex-1 truncate text-2xl font-bold"
                      title={selectedTask?.name}
                    >
                      {selectedTask?.name}
                    </h2>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      className="task-actions-trigger icon"
                      onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setActionsAnchor({ top: rect.bottom + 4, left: Math.max(8, rect.right - 160) }); setActionsOpen((value) => !value); }}
                      aria-label="Menu"
                      title="Task actions"
                      aria-haspopup="menu"
                      aria-expanded={actionsOpen}
                    >
                      <Menu />
                    </button>
                    {actionsOpen && createPortal(
                      <div role="menu" className="task-actions-menu fixed z-[100] grid min-w-40 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl" style={actionsAnchor} onClick={(event) => event.stopPropagation()}>
                        <button role="menuitem" className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800" onClick={() => open(selected, selected.status, triggerRef.current)}><Edit3 size={15} />Edit</button>
                        <button role="menuitem" className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-slate-800" onClick={() => { setActionsOpen(false); setTaskToDelete(selected); }}><Trash2 size={15} />Delete</button>
                      </div>, document.body,
                    )}
                  </div>
                  <button ref={closeRef} type="button" className="task-details-close icon" onClick={close} aria-label="Close" title="Close"><X /></button>
                  </div>
                </div>
              )}
            </div>
            {editing && createPortal(
              <div className="modal-overlay edit-modal-overlay">
                <div role="dialog" aria-modal="true" className="task-edit-popup flex max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Edit task</h2>
                <button type="button" className="icon inline-grid place-items-center justify-center leading-none" aria-label="Cancel editing" title="Cancel editing" onClick={() => setEditing(null)}><X size={18} /></button>
              </div>
              <form id="task-edit-form" onSubmit={save} className="grid min-h-0 min-w-0 gap-4 overflow-y-auto overscroll-contain pr-1">
                <label className="task-id-field grid min-w-0 gap-1 text-sm text-slate-300">
                  <span className="sr-only">Task ID</span>
                  <input
                    aria-label="Task ID"
                    disabled={!!editing}
                    required
                    className="min-w-0 w-full rounded border border-slate-700 bg-slate-950 p-2"
                    value={form.task_id}
                    onChange={(e) =>
                      setForm({ ...form, task_id: e.target.value })
                    }
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-sm text-slate-300">
                  Name
                  <input
                    required
                    className="min-w-0 w-full rounded border border-slate-700 bg-slate-950 p-2"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <fieldset className="grid gap-2 text-sm text-slate-300"><legend>Note color</legend><div className="note-color-picker" role="radiogroup" aria-label="Note color">{noteColors.map((noteColor) => <button key={noteColor.value} type="button" className="note-color-swatch" style={{ backgroundColor: noteColor.value }} aria-label={noteColor.label} aria-pressed={form.color === noteColor.value} onClick={() => { setForm({ ...form, color: noteColor.value }); setSelected((current) => current ? { ...current, color: noteColor.value } : current); }} />)}</div></fieldset>
                <label className="grid min-w-0 gap-1 text-sm text-slate-300">
                  Description
                  <textarea
                    className="min-h-24 min-w-0 w-full rounded border border-slate-700 bg-slate-950 p-2"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                  />
                </label>
              </form>
              <div className="mt-4 flex shrink-0 justify-end gap-2 border-t border-slate-700 pt-4">
                <button type="button" className="rounded border border-red-400 px-4 py-2 font-medium text-red-300 hover:bg-red-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300" aria-label="Cancel editing" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" form="task-edit-form" className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-300" aria-label="Save">Save</button>
              </div>
                </div>
              </div>, document.body,
            )}
            {selected && (
              <div className="grid min-w-0 gap-5">
                <div className="task-description-block min-w-0 border-t border-slate-700 pt-3">
                  <strong className="text-xs uppercase text-blue-300">
                    Description
                  </strong>
                  <p className="mt-1 break-words whitespace-pre-wrap text-slate-300">
                    {selectedTask?.description || "—"}
                  </p>
                </div>
                <section
                  className="criteria-section min-w-0 border-t border-slate-700 pt-3"
                  aria-labelledby="criteria-heading"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <strong
                      id="criteria-heading"
                      className="text-xs uppercase text-blue-300"
                    >
                      Acceptance criteria
                    </strong>
                    <span className="text-xs text-slate-400">
                      {criteria.filter((item) => item.completed).length}/
                      {criteria.length}
                    </span>
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const input = event.currentTarget.elements.namedItem(
                        "criterion",
                      ) as HTMLInputElement;
                      void addCriterion(input.value);
                      input.value = "";
                    }}
                  >
                    <input
                      name="criterion"
                      aria-label="New acceptance criterion"
                      placeholder="Add criterion…"
                      className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 p-2 text-sm"
                    />
                    <button
                      className="icon shrink-0"
                      aria-label="Add criterion"
                      title="Add criterion"
                    >
                      <Plus size={18} />
                    </button>
                  </form>
                  <div className="grid gap-2">
                    {criteria.map((criterion) => (
                      <div
                        key={criterion.id}
                        className="flex min-w-0 items-center gap-2 overflow-hidden border-b border-slate-700 py-3"
                      >
                        <input
                          type="checkbox"
                          checked={criterion.completed}
                          aria-label={`Completar: ${criterion.text}`}
                          onChange={() => void toggleCriterion(criterion.id)}
                        />
                        <span
                          className={`criterion-preview min-w-0 flex-1 overflow-hidden text-sm ${criterion.completed ? "text-slate-500 line-through" : "text-slate-200"}`}
                          title={criterion.text}
                        >
                          <span className="block min-w-0 truncate" dangerouslySetInnerHTML={{ __html: renderCriterionText(criterion.text) }} />
                        </span>
                        <div ref={(element) => { criterionMenuRefs.current[criterion.id] = element; }} className="relative shrink-0 self-center">
                          <button
                            type="button"
                            className="icon self-center"
                            aria-label={`More options for: ${criterion.text}`}
                            title="More options"
                            aria-haspopup="menu"
                            aria-expanded={criterionMenu === criterion.id}
                            aria-controls={`criterion-menu-${criterion.id}`}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              const rect = event.currentTarget.getBoundingClientRect();
                              setCriterionAnchor({ top: rect.bottom + 4, left: Math.max(8, rect.right - 160) });
                              setCriterionMenu(criterionMenu === criterion.id ? null : criterion.id);
                            }}
                          >
                            <MoreVertical aria-hidden="true" size={18} />
                          </button>
                          {criterionMenu === criterion.id && createPortal(
                            <div
                              ref={criterionPortalRef}
                              role="menu"
                              id={`criterion-menu-${criterion.id}`}
                              aria-label={`Actions for: ${criterion.text}`}
                              className="fixed z-[100] grid min-w-40 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl"
                              style={criterionAnchor}
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button role="menuitem" className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-blue-300 hover:bg-slate-800" onClick={() => { setCriterionMenu(null); setCriterionViewing(criterion); }}><Eye size={15} />View</button>
                              <button role="menuitem" className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-yellow-300 hover:bg-slate-800" onClick={() => { setCriterionMenu(null); editCriterion(criterion); }}><Edit3 size={15} />Edit</button>
                              <button role="menuitem" className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-slate-800" onClick={() => { setCriterionMenu(null); deleteCriterion(criterion); }}><Trash2 size={15} />Delete</button>
                            </div>, document.body,
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}
            {!taskDialog && <div className="sidebar-resize absolute left-0 top-0 z-30 h-full w-3 cursor-ew-resize" role="separator" aria-label="Resize sidebar" tabIndex={0}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                const onMove = (move: PointerEvent) => {
                  const minWidth = innerWidth * 0.2;
                  const next = Math.min(innerWidth, Math.max(minWidth, innerWidth - move.clientX));
                  setWidth(next);
                  localStorage.setItem(config.sidebarStorageKey, String(Math.round(next)));
                  void writeData("preferences.json", { sidebarWidth: Math.round(next) });
                };
                const stop = () => { removeEventListener("pointermove", onMove); removeEventListener("pointerup", stop); };
                addEventListener("pointermove", onMove);
                addEventListener("pointerup", stop);
              }}
            />}
          </aside>
        </>
      )}
    </main>
  );
}
