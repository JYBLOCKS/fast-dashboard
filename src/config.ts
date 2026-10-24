export const config = {
  appName: 'Fast Dashboard',
  defaultSidebarWidth: 520,
  sidebarStorageKey: 'fast-dashboard-sidebar-width',
  minSidebarWidth: 320,
  maxSidebarWidth: 800,
  statuses: [
    {value:'backlog', label:'Backlog', accent:'#9aa3ad'},
    {value:'todo', label:'TO-DO', accent:'#9b8ab8'},
    {value:'in_progress', label:'In Progress', accent:'#c5ad68'},
    {value:'done', label:'Done', accent:'#78a58a'},
    {value:'hold', label:'Hold', accent:'#c28b5b'},
  ] as const,
} as const;
export type TaskStatus = string;
export type Board = {value:string;label:string;accent:string};
