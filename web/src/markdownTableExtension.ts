import { RangeSetBuilder, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

export type MarkdownTableBlock = {
  from: number;
  to: number;
  startLineNumber: number;
  endLineNumber: number;
  hasTableWrapper: boolean;
  headers: string[];
  separators: string[];
  rows: string[][];
};

type TableCell = {
  row: number;
  column: number;
};

type TableSelection = {
  anchor: TableCell;
  focus: TableCell;
};

type SelectionBounds = {
  minRow: number;
  maxRow: number;
  minColumn: number;
  maxColumn: number;
};

export type MarkdownTableExtensionOptions = {
  editable?: boolean;
  renderCellText?: (cell: string) => string;
  onNotice?: (message: string) => void;
};

function isMarkdownTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.split("|").length > 2;
}

function isMarkdownTableSeparator(line: string) {
  if (!isMarkdownTableRow(line)) return false;
  return splitMarkdownTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function normalizeMarkdownTableCell(cell: string) {
  return cell.replace(/\s+/g, " ").replace(/\|/g, "/").trim();
}

function markdownTableRow(cells: string[]) {
  return `| ${cells.map(normalizeMarkdownTableCell).join(" | ")} |`;
}

function defaultRenderCellText(cell: string) {
  return cell
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1")
    .replace(/\[\[([^\]\n]+)\]\]/g, (_match, rawTarget: string) => {
      const [target, alias] = rawTarget.split("|").map((part) => part.trim());
      if (alias) return alias;
      const withoutHeading = (target ?? "").split("#")[0] ?? "";
      return withoutHeading.split("/").at(-1)?.replace(/\.md$/i, "") || withoutHeading;
    });
}

function serializeMarkdownTableBlock(table: MarkdownTableBlock) {
  const columnCount = getColumnCount(table);
  const headers = Array.from({ length: columnCount }, (_, index) => table.headers[index] ?? "");
  const separators = Array.from({ length: columnCount }, (_, index) => table.separators[index] || "---");
  const rows = table.rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ""));
  const lines = [markdownTableRow(headers), markdownTableRow(separators), ...rows.map(markdownTableRow)];

  return table.hasTableWrapper ? ["<table>", ...lines, "</table>"].join("\n") : lines.join("\n");
}

export function parseMarkdownTableBlock(doc: Text, lineNumber: number): MarkdownTableBlock | null {
  const startLine = doc.line(lineNumber);
  const hasTableWrapper = /^<table>\s*$/i.test(startLine.text.trim());
  const headerLineNumber = hasTableWrapper ? lineNumber + 1 : lineNumber;

  if (headerLineNumber + 1 > doc.lines) return null;

  const headerLine = doc.line(headerLineNumber);
  const separatorLine = doc.line(headerLineNumber + 1);

  if (!isMarkdownTableRow(headerLine.text) || !isMarkdownTableSeparator(separatorLine.text)) return null;

  const headers = splitMarkdownTableRow(headerLine.text);
  const separators = splitMarkdownTableRow(separatorLine.text);
  const rows: string[][] = [];
  let endLine = separatorLine;
  let currentLineNumber = headerLineNumber + 2;

  while (currentLineNumber <= doc.lines) {
    const currentLine = doc.line(currentLineNumber);
    const trimmed = currentLine.text.trim();

    if (hasTableWrapper && /^<\/table>\s*$/i.test(trimmed)) {
      endLine = currentLine;
      break;
    }

    if (!isMarkdownTableRow(currentLine.text) || isMarkdownTableSeparator(currentLine.text)) {
      if (hasTableWrapper && !trimmed) {
        endLine = currentLine;
      }
      break;
    }

    rows.push(splitMarkdownTableRow(currentLine.text));
    endLine = currentLine;
    currentLineNumber += 1;
  }

  return {
    from: startLine.from,
    to: endLine.to,
    startLineNumber: startLine.number,
    endLineNumber: endLine.number,
    hasTableWrapper,
    headers,
    separators,
    rows,
  };
}

function getColumnCount(table: MarkdownTableBlock) {
  return Math.max(1, table.headers.length, table.separators.length, ...table.rows.map((row) => row.length));
}

function getRowCount(table: MarkdownTableBlock) {
  return table.rows.length + 1;
}

function clampCell(table: MarkdownTableBlock, cell: TableCell): TableCell {
  return {
    row: Math.min(Math.max(-1, cell.row), table.rows.length - 1),
    column: Math.min(Math.max(0, cell.column), getColumnCount(table) - 1),
  };
}

function getCell(table: MarkdownTableBlock, row: number, column: number) {
  return row === -1 ? table.headers[column] ?? "" : table.rows[row]?.[column] ?? "";
}

function setCell(table: MarkdownTableBlock, row: number, column: number, value: string): MarkdownTableBlock {
  const columnCount = Math.max(getColumnCount(table), column + 1);
  const headers = Array.from({ length: columnCount }, (_, index) => table.headers[index] ?? "");
  const separators = Array.from({ length: columnCount }, (_, index) => table.separators[index] || "---");
  const rows = table.rows.map((currentRow) => Array.from({ length: columnCount }, (_, index) => currentRow[index] ?? ""));

  if (row === -1) {
    headers[column] = value;
  } else if (rows[row]) {
    rows[row][column] = value;
  }

  return { ...table, headers, separators, rows };
}

function insertRow(table: MarkdownTableBlock, afterRow: number): MarkdownTableBlock {
  const columnCount = getColumnCount(table);
  const nextRows = table.rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ""));
  const insertAt = Math.min(Math.max(0, afterRow + 1), nextRows.length);
  nextRows.splice(insertAt, 0, Array.from({ length: columnCount }, () => ""));
  return { ...table, rows: nextRows };
}

function insertColumn(table: MarkdownTableBlock, afterColumn: number): MarkdownTableBlock {
  const columnCount = getColumnCount(table);
  const insertAt = Math.min(Math.max(0, afterColumn + 1), columnCount);
  const headers = Array.from({ length: columnCount }, (_, index) => table.headers[index] ?? "");
  const separators = Array.from({ length: columnCount }, (_, index) => table.separators[index] || "---");
  const rows = table.rows.map((row) => Array.from({ length: columnCount }, (_, index) => row[index] ?? ""));

  headers.splice(insertAt, 0, "");
  separators.splice(insertAt, 0, "---");
  for (const row of rows) row.splice(insertAt, 0, "");

  return { ...table, headers, separators, rows };
}

function deleteRows(table: MarkdownTableBlock, rowIndexes: number[]): MarkdownTableBlock {
  const bodyRows = new Set(rowIndexes.filter((row) => row >= 0));
  if (!bodyRows.size) return table;

  const rows = table.rows.filter((_row, index) => !bodyRows.has(index));
  return { ...table, rows };
}

function deleteColumns(table: MarkdownTableBlock, columnIndexes: number[]): MarkdownTableBlock {
  const deleteSet = new Set(columnIndexes);
  const columnCount = getColumnCount(table);
  const keepIndexes = Array.from({ length: columnCount }, (_value, index) => index).filter((index) => !deleteSet.has(index));
  const nextKeepIndexes = keepIndexes.length ? keepIndexes : [0];

  return {
    ...table,
    headers: nextKeepIndexes.map((index) => (keepIndexes.length ? table.headers[index] ?? "" : "")),
    separators: nextKeepIndexes.map((index) => (keepIndexes.length ? table.separators[index] || "---" : "---")),
    rows: table.rows.map((row) => nextKeepIndexes.map((index) => (keepIndexes.length ? row[index] ?? "" : ""))),
  };
}

function selectedBounds(selection: TableSelection): SelectionBounds {
  return {
    minRow: Math.min(selection.anchor.row, selection.focus.row),
    maxRow: Math.max(selection.anchor.row, selection.focus.row),
    minColumn: Math.min(selection.anchor.column, selection.focus.column),
    maxColumn: Math.max(selection.anchor.column, selection.focus.column),
  };
}

function selectedRows(bounds: SelectionBounds) {
  return Array.from({ length: bounds.maxRow - bounds.minRow + 1 }, (_value, index) => bounds.minRow + index);
}

function selectedColumns(bounds: SelectionBounds) {
  return Array.from({ length: bounds.maxColumn - bounds.minColumn + 1 }, (_value, index) => bounds.minColumn + index);
}

function serializeSelectionAsMarkdown(table: MarkdownTableBlock, bounds: SelectionBounds) {
  const columns = selectedColumns(bounds);
  const rows = selectedRows(bounds).filter((row) => row >= 0);
  const headers = columns.map((column) => table.headers[column] ?? "");
  const separators = columns.map((column) => table.separators[column] || "---");
  const body = rows.map((row) => columns.map((column) => getCell(table, row, column)));

  return [markdownTableRow(headers), markdownTableRow(separators), ...body.map(markdownTableRow)].join("\n");
}

function serializeSelectionAsTsv(table: MarkdownTableBlock, bounds: SelectionBounds, renderCellText: (cell: string) => string) {
  return selectedRows(bounds)
    .map((row) => selectedColumns(bounds).map((column) => renderCellText(getCell(table, row, column))).join("\t"))
    .join("\n");
}

function escapeCsvCell(value: string) {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function serializeTableAsCsv(table: MarkdownTableBlock, renderCellText: (cell: string) => string) {
  const columnCount = getColumnCount(table);
  const rows = [-1, ...table.rows.map((_row, index) => index)];

  return rows
    .map((row) =>
      Array.from({ length: columnCount }, (_value, column) => escapeCsvCell(renderCellText(getCell(table, row, column)))).join(","),
    )
    .join("\n");
}

async function writeClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

class EmptyMarkdownWidget extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-markdown-hidden-source";
    return span;
  }
}

class MarkdownTableWidget extends WidgetType {
  constructor(
    private readonly table: MarkdownTableBlock,
    private readonly options: Required<MarkdownTableExtensionOptions>,
  ) {
    super();
  }

  eq(other: MarkdownTableWidget) {
    return JSON.stringify(this.table.headers) === JSON.stringify(other.table.headers) && JSON.stringify(this.table.rows) === JSON.stringify(other.table.rows);
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-markdown-table-wrapper";
    wrapper.tabIndex = -1;

    let selection: TableSelection = {
      anchor: { row: -1, column: 0 },
      focus: { row: -1, column: 0 },
    };
    let activeCell: TableCell = { row: -1, column: 0 };
    let isDragging = false;
    let contextMenu: HTMLDivElement | null = null;
    let contextMenuKeydown: ((event: KeyboardEvent) => void) | null = null;

    const commit = (nextTable: MarkdownTableBlock) => {
      if (!this.options.editable) {
        setNotice("This table is read-only here.");
        return;
      }

      view.dispatch({
        changes: {
          from: this.table.from,
          to: this.table.to,
          insert: serializeMarkdownTableBlock(nextTable),
        },
      });
    };

    const setNotice = (message: string) => this.options.onNotice(message);

    const bounds = () => selectedBounds(selection);

    const inSelection = (cell: TableCell) => {
      const selected = bounds();
      return cell.row >= selected.minRow && cell.row <= selected.maxRow && cell.column >= selected.minColumn && cell.column <= selected.maxColumn;
    };

    const cellSelector = (cell: TableCell) => `[data-table-row="${cell.row}"][data-table-column="${cell.column}"]`;
    const focusActiveCell = (preventScroll = false) => {
      wrapper.querySelector<HTMLElement>(cellSelector(activeCell))?.focus({ preventScroll });
    };

    const refreshSelection = () => {
      for (const element of wrapper.querySelectorAll<HTMLElement>("[data-table-row][data-table-column]")) {
        const row = Number(element.dataset.tableRow);
        const column = Number(element.dataset.tableColumn);
        const isActive = row === activeCell.row && column === activeCell.column;
        element.classList.toggle("cm-markdown-table-cell-selected", inSelection({ row, column }));
        element.classList.toggle("cm-markdown-table-cell-active", isActive);
      }
    };

    const focusCell = (cell: TableCell) => {
      const nextCell = clampCell(this.table, cell);
      activeCell = nextCell;
      selection = { anchor: nextCell, focus: nextCell };
      refreshSelection();
      focusActiveCell();
    };

    const extendSelection = (cell: TableCell, preventScroll = false) => {
      activeCell = clampCell(this.table, cell);
      selection = { ...selection, focus: activeCell };
      refreshSelection();
      focusActiveCell(preventScroll);
    };

    const selectRange = (anchor: TableCell, focus: TableCell, focusTarget = focus, preventScroll = false) => {
      selection = {
        anchor: clampCell(this.table, anchor),
        focus: clampCell(this.table, focus),
      };
      activeCell = clampCell(this.table, focusTarget);
      refreshSelection();
      focusActiveCell(preventScroll);
    };

    const selectRows = (rowStart: number, rowEnd: number, preventScroll = false) => {
      selectRange(
        { row: rowStart, column: 0 },
        { row: rowEnd, column: getColumnCount(this.table) - 1 },
        { row: rowStart, column: 0 },
        preventScroll,
      );
    };

    const selectColumn = (column: number, preventScroll = false) => {
      selectRange({ row: -1, column }, { row: this.table.rows.length - 1, column }, { row: -1, column }, preventScroll);
    };

    const selectTable = (preventScroll = false) => {
      selectRange(
        { row: -1, column: 0 },
        { row: this.table.rows.length - 1, column: getColumnCount(this.table) - 1 },
        { row: -1, column: 0 },
        preventScroll,
      );
    };

    const hideContextMenu = () => {
      contextMenu?.remove();
      contextMenu = null;
      if (contextMenuKeydown) {
        document.removeEventListener("keydown", contextMenuKeydown);
        contextMenuKeydown = null;
      }
    };

    const selectionSizeLabel = () => {
      const selected = bounds();
      const rowCount = selected.maxRow - selected.minRow + 1;
      const columnCount = selected.maxColumn - selected.minColumn + 1;
      return `${rowCount.toLocaleString()} ${rowCount === 1 ? "row" : "rows"} x ${columnCount.toLocaleString()} ${columnCount === 1 ? "column" : "columns"}`;
    };

    const copyMarkdown = async () => {
      hideContextMenu();
      try {
        await writeClipboard(serializeSelectionAsMarkdown(this.table, bounds()));
        setNotice(`Copied ${selectionSizeLabel()} as Markdown.`);
      } catch {
        setNotice("Could not copy Markdown table data.");
      }
    };

    const copyTsv = async () => {
      hideContextMenu();
      try {
        await writeClipboard(serializeSelectionAsTsv(this.table, bounds(), this.options.renderCellText));
        setNotice(`Copied ${selectionSizeLabel()} as TSV.`);
      } catch {
        setNotice("Could not copy TSV table data.");
      }
    };

    const exportCsv = () => {
      hideContextMenu();
      downloadText("markdown-table.csv", serializeTableAsCsv(this.table, this.options.renderCellText), "text/csv;charset=utf-8");
      setNotice("Downloaded table as CSV.");
    };

    const addRow = () => {
      hideContextMenu();
      commit(insertRow(this.table, Math.max(-1, activeCell.row)));
      setNotice("Added table row.");
    };

    const addColumn = () => {
      hideContextMenu();
      commit(insertColumn(this.table, activeCell.column));
      setNotice("Added table column.");
    };

    const removeRows = () => {
      hideContextMenu();
      const nextRows = selectedRows(bounds()).filter((row) => row >= 0);
      if (!nextRows.length) {
        setNotice("Select one or more body rows to delete.");
        return;
      }
      commit(deleteRows(this.table, nextRows));
      setNotice(`Deleted ${nextRows.length.toLocaleString()} ${nextRows.length === 1 ? "row" : "rows"}.`);
    };

    const removeColumns = () => {
      hideContextMenu();
      const nextColumns = selectedColumns(bounds());
      commit(deleteColumns(this.table, nextColumns));
      setNotice(`Deleted ${nextColumns.length.toLocaleString()} ${nextColumns.length === 1 ? "column" : "columns"}.`);
    };

    const moveSelection = (rowDelta: number, columnDelta: number, extend: boolean) => {
      const current = extend ? selection.focus : activeCell;
      const next = clampCell(this.table, { row: current.row + rowDelta, column: current.column + columnDelta });
      if (extend) {
        extendSelection(next);
      } else {
        focusCell(next);
      }
    };

    const moveTab = (backward: boolean, extend: boolean) => {
      const columnCount = getColumnCount(this.table);
      const rowCount = getRowCount(this.table);
      const current = extend ? selection.focus : activeCell;
      const normalizedRow = current.row + 1;
      const flatIndex = normalizedRow * columnCount + current.column + (backward ? -1 : 1);
      const nextFlatIndex = Math.min(Math.max(0, flatIndex), rowCount * columnCount - 1);
      const next = {
        row: Math.floor(nextFlatIndex / columnCount) - 1,
        column: nextFlatIndex % columnCount,
      };

      if (extend) {
        extendSelection(next);
      } else {
        focusCell(next);
      }
    };

    const showContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      hideContextMenu();

      contextMenu = document.createElement("div");
      contextMenu.className = "cm-markdown-table-context-menu";
      contextMenu.style.left = `${event.clientX}px`;
      contextMenu.style.top = `${event.clientY}px`;
      contextMenu.addEventListener("mousedown", (menuEvent) => menuEvent.stopPropagation());
      contextMenuKeydown = (keyEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        hideContextMenu();
      };
      document.addEventListener("keydown", contextMenuKeydown);

      const menuButton = (label: string, hint: string, onClick: () => void) => {
        const button = document.createElement("button");
        button.type = "button";
        button.innerHTML = `<span>${label}</span><kbd>${hint}</kbd>`;
        button.addEventListener("click", onClick);
        contextMenu?.appendChild(button);
      };

      menuButton("Copy Markdown", "Cmd/Ctrl+Shift+C", () => void copyMarkdown());
      menuButton("Copy TSV", "Cmd/Ctrl+C", () => void copyTsv());
      menuButton("Export CSV", "CSV", exportCsv);
      menuButton("Add Row", "Row +", addRow);
      menuButton("Add Column", "Col +", addColumn);
      menuButton("Delete Row", "Row -", removeRows);
      menuButton("Delete Column", "Col -", removeColumns);

      wrapper.appendChild(contextMenu);
      setTimeout(() => document.addEventListener("mousedown", hideContextMenu, { once: true }), 0);
    };

    const editCell = (cell: TableCell) => {
      if (!this.options.editable) {
        setNotice("This table is read-only here.");
        return;
      }

      activeCell = clampCell(this.table, cell);
      selection = { anchor: activeCell, focus: activeCell };
      refreshSelection();
      const display = wrapper.querySelector<HTMLElement>(cellSelector(activeCell));
      const shell = display?.closest<HTMLElement>(".cm-markdown-table-cell-editor");
      const input = shell?.querySelector<HTMLTextAreaElement>(".cm-markdown-table-cell-input");

      if (!display || !input) return;

      display.hidden = true;
      input.hidden = false;
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    };

    const onCellKeyDown = (event: KeyboardEvent, cell: TableCell) => {
      const isCopy = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c";
      if (isCopy && event.shiftKey) {
        event.preventDefault();
        void copyMarkdown();
        return;
      }
      if (isCopy) {
        event.preventDefault();
        void copyTsv();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectTable();
        return;
      }

      if (event.key === "F2" || event.key === " ") {
        event.preventDefault();
        editCell(cell);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const rowDelta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        const columnDelta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        moveSelection(rowDelta, columnDelta, event.shiftKey);
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        moveTab(event.shiftKey, false);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        moveSelection(event.shiftKey ? -1 : 1, 0, false);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        focusCell(activeCell);
      }
    };

    const bindCellPointerEvents = (target: HTMLElement, cell: TableCell) => {
      const isEditingInput = (eventTarget: EventTarget | null) =>
        eventTarget instanceof HTMLElement && Boolean(eventTarget.closest(".cm-markdown-table-cell-input"));

      target.addEventListener("mousedown", (event) => {
        if (isEditingInput(event.target)) return;

        event.preventDefault();
        event.stopPropagation();
        if (event.button !== 0) return;

        hideContextMenu();
        isDragging = true;
        if (event.shiftKey) {
          extendSelection(cell, true);
          return;
        }

        if (cell.row === -1) {
          selectColumn(cell.column, true);
          return;
        }
        focusCell(cell);
      });
      target.addEventListener("mouseenter", () => {
        if (isDragging) extendSelection(cell, true);
      });
      target.addEventListener("dblclick", (event) => {
        if (isEditingInput(event.target)) return;

        event.preventDefault();
        event.stopPropagation();
        editCell(cell);
      });
      target.addEventListener("contextmenu", (event) => {
        if (isEditingInput(event.target)) return;

        event.stopPropagation();
        showContextMenu(event);
      });
    };

    const table = document.createElement("table");
    table.className = "cm-markdown-table";
    table.role = "grid";

    const cellEditor = (cell: TableCell, value: string, onCommit: (nextValue: string) => void) => {
      const shell = document.createElement("div");
      shell.className = "cm-markdown-table-cell-editor";

      const display = document.createElement("div");
      display.className = "cm-markdown-table-cell-display";
      display.textContent = this.options.renderCellText(value) || "\u00a0";
      display.role = "gridcell";
      display.tabIndex = 0;
      display.title = this.options.editable ? "Select cell. Press Space or F2 to edit." : "Select cell.";
      display.dataset.tableRow = String(cell.row);
      display.dataset.tableColumn = String(cell.column);

      const input = document.createElement("textarea");
      input.className = "cm-markdown-table-cell-input";
      input.value = value;
      input.hidden = true;
      let lastCommittedValue = value;

      const resizeInput = () => {
        input.style.height = "auto";
        input.style.height = `${input.scrollHeight}px`;
      };

      const commitValue = () => {
        if (input.value === lastCommittedValue) return false;
        lastCommittedValue = input.value;
        onCommit(input.value);
        return true;
      };

      const showDisplay = () => {
        display.textContent = this.options.renderCellText(input.value) || "\u00a0";
        input.hidden = true;
        display.hidden = false;
        display.focus();
      };

      bindCellPointerEvents(display, cell);
      display.addEventListener("keydown", (event) => onCellKeyDown(event, cell));
      input.addEventListener("input", resizeInput);
      input.addEventListener("blur", () => {
        commitValue();
        showDisplay();
      });
      input.addEventListener("keydown", (event) => {
        event.stopPropagation();

        if (event.key === "Enter") {
          event.preventDefault();
          const nextCell = { row: activeCell.row + (event.shiftKey ? -1 : 1), column: activeCell.column };
          commitValue();
          showDisplay();
          focusCell(nextCell);
        } else if (event.key === "Escape") {
          event.preventDefault();
          input.value = value;
          lastCommittedValue = value;
          showDisplay();
          focusCell(activeCell);
        }
      });

      shell.appendChild(display);
      shell.appendChild(input);
      return shell;
    };

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "cm-markdown-table-corner-handle";
    corner.tabIndex = 0;
    corner.title = "Select whole table (Cmd/Ctrl+A). Right-click for table actions.";
    corner.addEventListener("mousedown", (event) => event.preventDefault());
    corner.addEventListener("click", () => selectTable(true));
    corner.addEventListener("contextmenu", (event) => {
      selectTable(true);
      showContextMenu(event);
    });
    corner.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectTable(true);
    });
    headerRow.appendChild(corner);

    const columnCount = getColumnCount(this.table);
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cell = document.createElement("th");
      bindCellPointerEvents(cell, { row: -1, column: columnIndex });
      cell.appendChild(
        cellEditor({ row: -1, column: columnIndex }, this.table.headers[columnIndex] ?? "", (nextValue) => {
          commit(setCell(this.table, -1, columnIndex, nextValue));
        }),
      );
      headerRow.appendChild(cell);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    for (let rowIndex = 0; rowIndex < this.table.rows.length; rowIndex += 1) {
      const row = this.table.rows[rowIndex];
      const tableRow = document.createElement("tr");
      const rowHandleCell = document.createElement("th");
      rowHandleCell.className = "cm-markdown-table-row-handle";
      rowHandleCell.tabIndex = 0;
      rowHandleCell.title = "Select row. Right-click for row actions.";
      rowHandleCell.addEventListener("mousedown", (event) => event.preventDefault());
      rowHandleCell.addEventListener("click", () => selectRows(rowIndex, rowIndex, true));
      rowHandleCell.addEventListener("contextmenu", (event) => {
        selectRows(rowIndex, rowIndex, true);
        showContextMenu(event);
      });
      rowHandleCell.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectRows(rowIndex, rowIndex, true);
      });
      tableRow.appendChild(rowHandleCell);

      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        const cell = document.createElement("td");
        bindCellPointerEvents(cell, { row: rowIndex, column: columnIndex });
        cell.appendChild(
          cellEditor({ row: rowIndex, column: columnIndex }, row[columnIndex] ?? "", (nextValue) => {
            commit(setCell(this.table, rowIndex, columnIndex, nextValue));
          }),
        );
        tableRow.appendChild(cell);
      }

      tbody.appendChild(tableRow);
    }

    wrapper.addEventListener("mouseup", () => {
      isDragging = false;
    });
    wrapper.addEventListener("mouseleave", () => {
      isDragging = false;
    });
    wrapper.addEventListener("contextmenu", (event) => {
      if (event.target === wrapper) showContextMenu(event);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
    refreshSelection();
    return wrapper;
  }
}

export function buildMarkdownTableExtension(options: MarkdownTableExtensionOptions = {}): Extension {
  const extensionOptions: Required<MarkdownTableExtensionOptions> = {
    editable: options.editable ?? true,
    renderCellText: options.renderCellText ?? defaultRenderCellText,
    onNotice: options.onNotice ?? (() => undefined),
  };

  function buildDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();

    for (const { from, to } of view.visibleRanges) {
      let position = from;

      while (position <= to) {
        const line = view.state.doc.lineAt(position);
        const table = parseMarkdownTableBlock(view.state.doc, line.number);

        if (table) {
          for (let tableLineNumber = table.startLineNumber; tableLineNumber <= table.endLineNumber; tableLineNumber += 1) {
            const tableLine = view.state.doc.line(tableLineNumber);

            if (tableLineNumber > table.startLineNumber) {
              builder.add(
                tableLine.from,
                tableLine.from,
                Decoration.line({
                  class: "cm-markdown-table-hidden-line",
                }),
              );
            }

            builder.add(
              tableLine.from,
              tableLine.to,
              Decoration.replace({
                widget:
                  tableLineNumber === table.startLineNumber
                    ? new MarkdownTableWidget(table, extensionOptions)
                    : new EmptyMarkdownWidget(),
              }),
            );
          }

          position = table.to + 1;
          continue;
        }

        if (line.to >= to) break;
        position = line.to + 1;
      }
    }

    return builder.finish();
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
    },
  );
}
