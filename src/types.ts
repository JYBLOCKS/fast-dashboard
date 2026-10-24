import type {TaskStatus} from './config';
export type AcceptanceCriterion={id:string;text:string;completed:boolean};
export type Task={task_id:string;name:string;description:string;acceptance_criteria:(AcceptanceCriterion|string)[]|string;status:TaskStatus};
