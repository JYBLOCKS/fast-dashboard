import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Menu,
  MoreVertical,
  Plus,
  RefreshCw,
  Trash2,
  X,
  ChevronRight,
  Edit3,
  Eye,
  Bold,
  Underline,
} from "lucide-react";
import { config, type Board, type TaskStatus } from "./config";
import { useTaskStore } from "./store";
import type { AcceptanceCriterion, Task } from "./types";
import "./index.css";

const empty = {
  task_id: "",
  name: "",
  description: "",
  acceptance_criteria: "",
  status: "backlog" as TaskStatus,
};
const storedWidth = () => {
  const value = Number(localStorage.getItem(config.sidebarStorageKey));
  return Number.isFinite(value) &&
    value >= config.minSidebarWidth &&
    value <= config.maxSidebarWidth
    ? value
    : config.defaultSidebarWidth;
};
const renderCriterionText = (value: string) => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/__\{(#[0-9a-fA-F]{3,8})\}(.+?)__/g, '<u style="text-decoration-color:$1">$2</u>')
  .replace(/__(.+?)__/g, "<u>$1</u>");
const boardKey = "fast-dashboard-boards";
const boardColors = [
  "#9aa3ad",
  "#9b8ab8",
  "#c5ad68",
  "#78a58a",
  "#c28b5b",
  "#6aa6c9",
  "#c77d9b",
];
const readBoards = (): Board[] => {
  try {
    const saved = localStorage.getItem(boardKey);
    const value = saved ? JSON.parse(saved) : [...config.statuses];
    return Array.isArray(value)
      ? value.map((board, index) => ({ ...board, accent: typeof board.accent === "string" && board.accent ? board.accent : boardColors[index % boardColors.length] }))
      : [...config.statuses];
  } catch {
    return [...config.statuses];
  }
};

export default function App() {
  const { tasks, loading, error, notice, load, move, create, update, remove } =
    useTaskStore();
  const [selected, setSelected] = useState<Task | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [taskDialog, setTaskDialog] = useState(false);
  const [form, setForm] = useState(empty);
  const [criterionDrafts, setCriterionDrafts] = useState<AcceptanceCriterion[]>([]);
  const [criterionColor, setCriterionColor] = useState("#facc15");
  const [width, setWidth] = useState(storedWidth);
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
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const drawerOpen = Boolean(selected || editing);
  const selectedTask = selected
    ? (tasks.find((task) => task.task_id === selected.task_id) ?? selected)
    : null;
  const generateTaskId = () => {
    const used = new Set(tasks.map((task) => task.task_id));
    let candidate = `TASK-${Date.now()}`;
    let suffix = 1;
    while (used.has(candidate)) candidate = `TASK-${Date.now()}-${suffix++}`;
    return candidate;
  };
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useTaskStore.setState({ notice: "" }), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!drawerOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    addEventListener("keydown", onKey);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", onKey);
      document.body.style.overflow = old;
    };
  }, [drawerOpen]);
  useEffect(() => {
    if (!taskDialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
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
    if (task) setSelected(task);
    setActionsOpen(false);
  };
  const close = () => {
    setSelected(null);
    setEditing(null);
    setTaskDialog(false);
    setActionsOpen(false);
    setBoardMenu(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = {
      ...form,
      task_id: editing ? form.task_id : generateTaskId(),
      acceptance_criteria: criterionDrafts
        .map((item) => item.text.trim())
        .filter(Boolean),
    };
    try {
      if (editing) {
        await update(editing.task_id, {
          task_id: form.task_id,
          name: form.name,
          description: form.description,
        });
      } else {
        await create(value);
        // Close the creation modal after a successful create.
        setTaskDialog(false);
      }
      setEditing(null);
      setTaskDialog(false);
    } catch {
      /* API error remains visible after refresh. */
    }
  };
  const moveTask = async (id: string, status: TaskStatus) => {
    try {
      await move(id, status);
    } finally {
      setDrag(null);
    }
  };
  const saveBoards = (next: Board[]) => {
    setBoards(next);
    localStorage.setItem(boardKey, JSON.stringify(next));
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
  const criteria: AcceptanceCriterion[] =
    selectedTask && Array.isArray(selectedTask.acceptance_criteria)
      ? selectedTask.acceptance_criteria.map((item, index) =>
          typeof item === "string"
            ? { id: `legacy-${index}`, text: item, completed: false }
            : item,
        )
      : [];
  const updateCriteria = async (next: AcceptanceCriterion[]) => {
    if (selectedTask)
      await update(selectedTask.task_id, { acceptance_criteria: next });
  };
  const activeCriteria = taskDialog ? criterionDrafts : criteria;
  const updateActiveCriteria = async (next: AcceptanceCriterion[]) => {
    if (taskDialog) setCriterionDrafts(next);
    else await updateCriteria(next);
  };
  const addCriterion = async (text: string) => {
    const value = text.trim();
    if (value)
      await updateCriteria([
        ...criteria,
        { id: `criterion-${Date.now()}`, text: value, completed: false },
      ]);
  };
  const toggleCriterion = async (id: string) =>
    updateCriteria(
      criteria.map((item) => ({
        ...item,
        completed: item.id === id ? !item.completed : item.completed,
      })),
    );
  const editCriterion = (item: AcceptanceCriterion) => {
    setCriterionEditing(item);
    setCriterionDraft(item.text);
    const color = item.text.match(/__\{(#[0-9a-fA-F]{3,8})\}/)?.[1];
    setCriterionColor(color || "#facc15");
  };
  const saveCriterion = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = criterionDraft.trim();
    if (!criterionEditing || !value) return;
    await updateActiveCriteria(activeCriteria.map((current) => current.id === criterionEditing.id ? { ...current, text: value } : current));
    setCriterionEditing(null);
  };
  const deleteCriterion = (item: AcceptanceCriterion) => setCriterionDeleting(item);
  const applyCriterionColor = (color: string) => {
    applyCriterionFormat("__{" + color + "}", "__");
  };
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
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:items-end">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-bold uppercase tracking-[.12em] text-blue-300">
            Workspace / Operations
          </p>
          <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
            {config.appName}
          </h1>
        </div>
        <button
          className="icon shrink-0"
          aria-label="Refresh"
          title="Refresh"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={22} />
        </button>
      </header>
      {(error || notice) && (
        <p
          role="status"
          className={`mb-4 break-words text-sm ${error ? "text-red-300" : "text-green-300"}`}
        >
          {error || notice}
        </p>
      )}
      {loading ? (
        <div className="min-h-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/60 p-5 text-sm text-slate-400">
          Loading tasks…
        </div>
      ) : (
        <section
          aria-label="Tablero de tareas"
          className="dashboard-grid min-h-0 flex-1 items-stretch gap-3 pb-0 sm:gap-4"
        >
          {boards.map((col) => {
            const columnTasks = tasks.filter((t) => t.status === col.value);
            return (
              <div
                key={col.value}
                className="board-column min-h-0 min-w-0 scroll-mx-4 snap-start rounded-xl border border-slate-700 bg-slate-950/60 p-2"
                style={{ borderTop: `3px solid ${col.accent}` }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (drag) void moveTask(drag, col.value);
                }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <h2
                    className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-wider"
                    style={{ color: col.accent }}
                  >
                    {col.label}
                  </h2>
                  <span
                    className="shrink-0 rounded-full px-2 py-1 text-xs"
                    style={{ background: `${col.accent}22`, color: col.accent }}
                  >
                    {columnTasks.length}
                  </span>
                  <div className="board-header-actions ml-auto flex shrink-0 items-center gap-0">
                    <button
                      className="icon"
                      aria-label={"Add to " + col.label}
                      title={"Add to " + col.label}
                      onClick={(event) =>
                        open(undefined, col.value, event.currentTarget)
                      }
                    >
                      <Plus size={18} />
                    </button>
                    <div className="relative shrink-0">
                    <button
                      className="icon"
                      aria-label={`Opciones de ${col.label}`}
                      title="Board options"
                      aria-haspopup="menu"
                      aria-expanded={boardMenu === col.value}
                      onClick={(event) => {
                        event.stopPropagation();
                        setBoardMenu(
                          boardMenu === col.value ? null : col.value,
                        );
                      }}
                    >
                      <MoreVertical size={18} />
                    </button>
                    {boardMenu === col.value && (
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-10 mt-1 grid min-w-36 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl"
                      >
                        <button
                          role="menuitem"
                          className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                          onClick={() => {
                            setBoardMenu(null);
                            openBoardDialog(col);
                          }}
                        >
                          <Edit3 size={15} />
                          Edit
                        </button>
                        <button
                          role="menuitem"
                          className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-slate-800"
                          onClick={() => {
                            setBoardMenu(null);
                            setBoardToDelete(col);
                          }}
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                    </div>
                  </div>
                <div className="board-column-content grid min-h-0 content-start gap-2">
                  {columnTasks.map((task) => (
                    <article
                      key={task.task_id}
                      draggable
                      tabIndex={0}
                      role="button"
                      onDragStart={() => setDrag(task.task_id)}
                      onDragEnd={() => setDrag(null)}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setSelected(task);
                        setActionsOpen(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          triggerRef.current = event.currentTarget;
                          setSelected(task);
                          setActionsOpen(false);
                        }
                      }}
                      className="task-card min-w-0 cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-2 outline-none hover:border-blue-300 focus-visible:ring-2 focus-visible:ring-blue-300"
                    >
                      <h3 className="truncate font-medium" title={task.name}>
                        {task.name}
                      </h3>
                    </article>
                  ))}
                  {!columnTasks.length && (
                    <p className="py-3 text-center text-sm text-slate-500">
                      No tasks
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          <button
            className="icon add-board-button shrink-0 self-start"
            aria-label="Add board"
            title="Add board"
            onClick={() => openBoardDialog()}
          >
            <Plus size={22} />
          </button>
        </section>
      )}
      {boardToDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setBoardToDelete(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="board-delete-title" className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
            <div className="grid gap-4">
              <h2 id="board-delete-title" className="text-lg font-bold">Delete board</h2>
              <p className="text-slate-300">Are you sure you want to delete “{boardToDelete.label}”? Tasks will move to the first available board.</p>
              <div className="flex justify-end gap-2"><button type="button" className="rounded border border-slate-600 px-4 py-2 text-slate-200 hover:bg-slate-800" onClick={() => setBoardToDelete(null)}>Cancel</button><button type="button" className="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500" onClick={() => void deleteBoard(boardToDelete)}>Delete</button></div>
            </div>
          </div>
        </div>
      )}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setTaskToDelete(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="task-delete-title" className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
            <div className="grid gap-4">
              <h2 id="task-delete-title" className="text-lg font-bold">Delete task</h2>
              <p className="text-slate-300">Are you sure you want to delete “{taskToDelete.name}”?</p>
              <div className="flex justify-end gap-2"><button type="button" className="rounded border border-slate-600 px-4 py-2 text-slate-200 hover:bg-slate-800" onClick={() => setTaskToDelete(null)}>Cancel</button><button type="button" className="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500" onClick={async () => { await remove(taskToDelete.task_id); setTaskToDelete(null); close(); }}>Delete</button></div>
            </div>
          </div>
        </div>
      )}
      {boardDialog && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setBoardDialog(null); }}>
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
                <button type="button" className="rounded border border-slate-600 px-4 py-2 text-slate-200 hover:bg-slate-800" onClick={() => setBoardDialog(null)}>Cancel</button>
                <button type="submit" className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-500">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {taskDialog && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="task-create-title" className="max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
            <form onSubmit={save} className="grid gap-4">
              <div className="flex items-center justify-between gap-3">
                <h2 id="task-create-title" className="text-lg font-bold">Add task</h2>
                <button type="button" className="icon" aria-label="Close" title="Close" onClick={close}><X size={18} /></button>
              </div>
              <label className="grid gap-1 text-sm text-slate-300">
                Task ID
                <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950 p-2 text-slate-300"><span className="font-mono">{form.task_id}</span><span className="ml-auto text-xs text-slate-500">Generated automatically</span></div>
              </label>
              <label className="grid gap-1 text-sm text-slate-300">
                Name
                <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded border border-slate-700 bg-slate-950 p-2" />
              </label>
              <label className="grid gap-1 text-sm text-slate-300">
                Description
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="w-full resize-y rounded border border-slate-700 bg-slate-950 p-2" />
              </label>
              <div className="grid gap-2 text-sm text-slate-300">
                <span>Initial status</span>
                <div className="flex items-center gap-2 rounded border px-3 py-2" style={{ color: boards.find((board) => board.value === form.status)?.accent, borderColor: boards.find((board) => board.value === form.status)?.accent, backgroundColor: `${boards.find((board) => board.value === form.status)?.accent}18` }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: boards.find((board) => board.value === form.status)?.accent }} />
                  <strong>{boards.find((board) => board.value === form.status)?.label ?? form.status}</strong>
                  <span className="ml-auto text-xs text-slate-400">Tasks will be added here</span>
                </div>
              </div>
              <div className="grid gap-2 text-sm text-slate-300">
                <div className="flex items-center justify-between"><span>Acceptance criteria</span><button type="button" className="rounded border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800" onClick={() => setCriterionDrafts([...criterionDrafts, { id: `criterion-${Date.now()}`, text: "New criterion", completed: false }])}><Plus size={13} className="mr-1 inline" />Add criterion</button></div>
                <span className="text-xs text-slate-500">Each criterion can be added and edited separately.</span>
                <div className="grid gap-2">
                  {criterionDrafts.map((criterion, index) => <div key={criterion.id} className="flex items-center gap-2"><span className="w-5 text-center text-xs text-slate-500">{index + 1}</span><span className="min-w-0 flex-1 truncate" dangerouslySetInnerHTML={{ __html: renderCriterionText(criterion.text) }} /><button type="button" className="icon" aria-label={`More options for: ${criterion.text}`} aria-expanded={criterionMenu === criterion.id} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); setCriterionAnchor({ top: rect.bottom + 4, left: Math.max(8, rect.right - 160) }); setCriterionMenu(criterionMenu === criterion.id ? null : criterion.id); }}><MoreVertical size={18} /></button>{criterionMenu === criterion.id && createPortal(<div ref={criterionPortalRef} role="menu" className="fixed z-[100] grid min-w-40 gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl" style={criterionAnchor} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><button role="menuitem" className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-blue-300 hover:bg-slate-800" onClick={() => { setCriterionMenu(null); setCriterionViewing(criterion); }}><Eye size={15} />View</button><button role="menuitem" className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-yellow-300 hover:bg-slate-800" onClick={() => { setCriterionMenu(null); editCriterion(criterion); }}><Edit3 size={15} />Edit</button><button role="menuitem" className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-slate-800" onClick={() => { setCriterionMenu(null); deleteCriterion(criterion); }}><Trash2 size={15} />Delete</button></div>, document.body)}</div>)}
                  {!criterionDrafts.length && <p className="rounded border border-dashed border-slate-700 p-3 text-center text-xs text-slate-500">No criteria yet.</p>}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded border border-slate-600 px-4 py-2 text-slate-200 hover:bg-slate-800" onClick={close}>Cancel</button>
                <button type="submit" className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-500">Add task</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {(drawerOpen || taskDialog) && (
        <>
          <div className="fixed inset-0 z-10 bg-black/50" onClick={close} />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={editing ? "Edit task" : "Task details"}
            className={taskDialog ? "contents" : "task-sidebar fixed right-0 top-0 z-20 h-[100dvh] max-w-full overflow-y-auto border-l border-slate-700 bg-slate-900 p-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl sm:p-5"}
            style={taskDialog ? undefined : { width: `min(${width}px,100vw)` }}
          >
            {!taskDialog && <button
              ref={closeRef}
              className="sidebar-close icon"
              onClick={close}
              aria-label="Close"
              title="Close"
            >
              <ChevronRight />
            </button>}
            {(criterionEditing || criterionDeleting || criterionViewing) && (
              <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4">
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
                      <div className="flex items-center gap-1 rounded border border-slate-700 bg-slate-950 p-2" aria-label="Text formatting"><button type="button" className="icon" aria-label="Apply bold" title="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => applyCriterionFormat("**", "**")}><Bold size={17} /></button><button type="button" className="icon" aria-label="Apply underline" title="Underline" onMouseDown={(event) => event.preventDefault()} onClick={() => applyCriterionFormat("__", "__")}><Underline size={17} /></button><input id="criterion-color" type="color" aria-label="Apply color" title="Color" value={criterionColor} onChange={(event) => { const color = event.target.value; setCriterionColor(color); applyCriterionColor(color); }} className="h-8 w-12 cursor-pointer rounded border border-slate-600 bg-slate-900 p-1" /></div>
                      <textarea ref={criterionTextRef} autoFocus value={criterionDraft} onChange={(event) => setCriterionDraft(event.target.value)} aria-label="Criterion text" required rows={6} className="w-full resize-y rounded border border-slate-700 bg-slate-950 p-2" />
                      <div className="flex justify-end gap-2"><button type="button" className="rounded border border-slate-600 px-4 py-2 text-slate-200 hover:bg-slate-800" onClick={() => setCriterionEditing(null)}>Cancel</button><button type="submit" className="rounded bg-yellow-400 px-4 py-2 font-medium text-slate-950 hover:bg-yellow-300">Save</button></div>
                    </form>
                  ) : (
                    <div className="grid gap-4"><h2 id="criterion-popup-title" className="text-lg font-bold">Delete criterion</h2><p className="text-slate-300">Are you sure you want to delete “{criterionDeleting?.text}”?</p><div className="flex justify-end gap-2"><button type="button" className="rounded border border-slate-600 px-4 py-2 text-slate-200 hover:bg-slate-800" onClick={() => setCriterionDeleting(null)}>Cancel</button><button type="button" className="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-500" onClick={() => void confirmDeleteCriterion()}>Delete</button></div></div>
                  )}
                </div>
              </div>
            )}
            {selected && (
              <div className="mb-6 flex items-center justify-between gap-3 border-b border-slate-700 pb-3 pt-10 text-xs text-slate-400">
                <div className="min-w-0 truncate">
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
                      color: boards.find((s) => s.value === selectedTask?.status)?.accent,
                      borderColor: boards.find((s) => s.value === selectedTask?.status)?.accent,
                      backgroundColor: `${boards.find((s) => s.value === selectedTask?.status)?.accent}22`,
                    }}
                    value={selectedTask?.status}
                    onChange={(event) => void moveTask(selectedTask!.task_id, event.target.value as TaskStatus)}
                  >
                    {boards.map((s) => <option key={s.value} value={s.value} style={{ color: s.accent, backgroundColor: "#0f172a" }}>{s.label}</option>)}
                  </select>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      className="icon"
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
                  </div>
                </div>
              )}
            </div>
            {editing && (
              <div className="task-edit-popup fixed left-1/2 top-1/2 z-30 max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 p-4 shadow-2xl sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Edit task</h2>
                <button type="button" className="icon inline-grid place-items-center justify-center leading-none" aria-label="Cancel editing" title="Cancel editing" onClick={() => setEditing(null)}><X size={18} /></button>
              </div>
              <form onSubmit={save} className="grid min-w-0 gap-4">
                <label className="grid min-w-0 gap-1 text-sm text-slate-300">
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
                <div className="flex justify-end gap-2">
                  <button
                    type="submit"
                    className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-300"
                    aria-label="Save"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-400 px-4 py-2 font-medium text-red-300 hover:bg-red-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
                    aria-label="Cancel editing"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
              </div>
            )}
            {selected && (
              <div className="grid min-w-0 gap-5">
                <div className="min-w-0 border-t border-slate-700 pt-3">
                  <strong className="text-xs uppercase text-blue-300">
                    Description
                  </strong>
                  <p className="mt-1 break-words whitespace-pre-wrap text-slate-300">
                    {selectedTask?.description || "—"}
                  </p>
                </div>
                <section
                  className="min-w-0 border-t border-slate-700 pt-3"
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
                </section>
              </div>
            )}
            <div
              className="sidebar-resize absolute left-0 top-0 hidden h-full w-4 cursor-ew-resize md:block"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                const resize = (clientX: number) => {
                  const next = Math.min(
                    config.maxSidebarWidth,
                    Math.max(config.minSidebarWidth, innerWidth - clientX),
                  );
                  setWidth(next);
                  localStorage.setItem(
                    config.sidebarStorageKey,
                    String(Math.round(next)),
                  );
                };
                const onMove = (pointer: PointerEvent) =>
                  resize(pointer.clientX);
                const stop = () => {
                  removeEventListener("pointermove", onMove);
                  removeEventListener("pointerup", stop);
                };
                addEventListener("pointermove", onMove);
                addEventListener("pointerup", stop);
              }}
            />
          </aside>
        </>
      )}
    </main>
  );
}
