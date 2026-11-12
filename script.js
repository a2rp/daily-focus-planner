// Daily Focus Planner (Tasks + Half-hour blocks + pretty date + prev/next)

const dateInput = document.getElementById("planDate");
const datePretty = document.getElementById("datePretty");
const timeBlocksContainer = document.getElementById("timeBlocks");
const storageStatus = document.getElementById("storageStatus");

// Tasks
const taskListEl = document.getElementById("taskList");
const addTaskBtn = document.getElementById("addTaskBtn");

// Buttons
const resetBtn = document.getElementById("resetBtn");
const printBtn = document.getElementById("printBtn");
const prevDayBtn = document.getElementById("prevDayBtn");
const nextDayBtn = document.getElementById("nextDayBtn");
const currentYearEl = document.getElementById("currentYear");
const topBtn = document.getElementById("topBtn");

if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();

// Hours: 06:00..21:30 (22 exclusive)
const dayStartHour = 6;
const dayEndHour = 22;

let currentData = null;
let currentDate = "";

// ---- Utils ----
const pad = (n) => String(n).padStart(2, "0");
const keyFor = (h, m) => `${pad(h)}:${pad(m)}`;

function todaysDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function storageKeyFor(dateStr) {
    return `dailyFocusPlanner:${dateStr}`;
}

function isValidDateString(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const date = new Date(`${dateStr}T00:00:00`);
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const normalizedDate = `${date.getFullYear()}-${month}-${day}`;
    return Number.isFinite(date.getTime()) && normalizedDate === dateStr;
}

function showStorageIssue() {
    if (!storageStatus) return;
    storageStatus.hidden = false;
    storageStatus.textContent = "The browser could not read or save this plan. Changes may not be saved after you close this page.";
}

function formatPretty(dateStr) {
    // outputs like "Sep 20, 2025"
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}
function updatePretty() {
    datePretty.textContent = formatPretty(dateInput.value);
}

// Build empty plan with :00 and :30 keys
function emptyPlan() {
    const blocks = {};
    for (let h = dayStartHour; h < dayEndHour; h++) {
        blocks[keyFor(h, 0)] = "";
        blocks[keyFor(h, 30)] = "";
    }
    return { tasks: [{ text: "", done: false }], blocks };
}

// Backward-compat
function upgradePlanStructure(obj) {
    const base = emptyPlan();
    const plan = obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
    const taskItems = Array.isArray(plan.tasks)
        ? plan.tasks
        : Array.isArray(plan.priorities)
          ? plan.priorities.map((item) => ({
                text: typeof item?.text === "string" ? item.text : "",
                done: item?.done === true,
            }))
          : base.tasks;
    const tasks = taskItems
        .filter((task) => task && typeof task === "object" && !Array.isArray(task))
        .map((task) => ({
            text: typeof task.text === "string" ? task.text.slice(0, 160) : "",
            done: task.done === true,
        }));
    const savedBlocks = plan.blocks && typeof plan.blocks === "object" && !Array.isArray(plan.blocks)
        ? plan.blocks
        : {};
    const blocks = { ...base.blocks };
    Object.keys(blocks).forEach((key) => {
        blocks[key] = typeof savedBlocks[key] === "string"
            ? savedBlocks[key].slice(0, 500)
            : "";
    });
    return { tasks: tasks.length ? tasks : base.tasks, blocks };
}

function loadPlan(dateStr) {
    let raw;
    try {
        raw = localStorage.getItem(storageKeyFor(dateStr));
    } catch {
        showStorageIssue();
        return emptyPlan();
    }
    if (!raw) return emptyPlan();
    try {
        return upgradePlanStructure(JSON.parse(raw));
    } catch {
        showStorageIssue();
        return emptyPlan();
    }
}
function savePlan(dateStr, data) {
    try {
        localStorage.setItem(storageKeyFor(dateStr), JSON.stringify(data));
        return true;
    } catch {
        showStorageIssue();
        return false;
    }
}

// ---- Tasks UI ----
function renderTasks(plan) {
    taskListEl.replaceChildren();
    plan.tasks.forEach((task, idx) => {
        const row = document.createElement("div");
        row.className = "task-row";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = task.done === true;
        cb.setAttribute("aria-label", `Mark task ${idx + 1} complete`);
        cb.addEventListener("change", () => {
            currentData.tasks[idx].done = cb.checked;
            savePlan(dateInput.value, currentData);
        });

        const input = document.createElement("input");
        input.type = "text";
        input.value = task.text || "";
        input.setAttribute("aria-label", `Task ${idx + 1} description`);
        input.placeholder = `Task #${idx + 1}`;
        input.maxLength = 160;
        input.addEventListener("input", () => {
            currentData.tasks[idx].text = input.value;
            savePlan(dateInput.value, currentData);
        });

        const del = document.createElement("button");
        del.className = "del";
        del.title = "Remove task";
        del.setAttribute("aria-label", `Remove task ${idx + 1}`);
        del.textContent = "×";
        del.addEventListener("click", () => {
            if (!confirm("Remove this task?")) return;
            currentData.tasks.splice(idx, 1);
            if (!currentData.tasks.length)
                currentData.tasks.push({ text: "", done: false });
            savePlan(dateInput.value, currentData);
            renderTasks(currentData);
        });

        row.appendChild(cb);
        row.appendChild(input);
        row.appendChild(del);
        taskListEl.appendChild(row);
    });
}

// ---- Time Blocks UI (two per row) ----
function renderTimeBlocks(plan) {
    timeBlocksContainer.replaceChildren();
    for (let h = dayStartHour; h < dayEndHour; h++) {
        const row = document.createElement("div");
        row.className = "time-row";
        [0, 30].forEach((m) => {
            const key = keyFor(h, m);
            const label = document.createElement("label");
            const textarea = document.createElement("textarea");
            textarea.id = `time-block-${key.replace(":", "-")}`;
            textarea.maxLength = 500;
            label.htmlFor = textarea.id;
            label.textContent = key;
            textarea.value = plan.blocks[key] || "";
            textarea.placeholder = "What happens in this half hour?";
            textarea.addEventListener("input", () => {
                currentData.blocks[key] = textarea.value;
                savePlan(dateInput.value, currentData);
            });

            row.appendChild(label);
            row.appendChild(textarea);
        });
        timeBlocksContainer.appendChild(row);
    }
}

function loadDay(dateStr) {
    if (!isValidDateString(dateStr)) {
        dateInput.value = currentDate || todaysDateString();
        return;
    }
    currentDate = dateStr;
    currentData = loadPlan(dateStr);
    renderTasks(currentData);
    renderTimeBlocks(currentData);
    updatePretty();
}

// ---- Events ----
dateInput.addEventListener("change", () => loadDay(dateInput.value));

addTaskBtn?.addEventListener("click", () => {
    currentData.tasks.push({ text: "", done: false });
    savePlan(dateInput.value, currentData);
    renderTasks(currentData);
    taskListEl
        .querySelector('.task-row:last-child input[type="text"]')
        ?.focus();
});

resetBtn.addEventListener("click", () => {
    if (!confirm("Clear everything for this date? This can't be undone."))
        return;
    currentData = emptyPlan();
    savePlan(dateInput.value, currentData);
    renderTasks(currentData);
    renderTimeBlocks(currentData);
});

printBtn.addEventListener("click", () => window.print());

prevDayBtn.addEventListener("click", () => shiftDay(-1));
nextDayBtn.addEventListener("click", () => shiftDay(1));
topBtn?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

function shiftDay(delta) {
    const d = new Date(`${currentDate}T00:00:00`);
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear(),
        m = pad(d.getMonth() + 1),
        day = pad(d.getDate());
    dateInput.value = `${y}-${m}-${day}`;
    loadDay(dateInput.value);
}

// ---- Init ----
(function init() {
    dateInput.value = todaysDateString();
    loadDay(dateInput.value);
})();
