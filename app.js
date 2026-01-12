const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let dirHandle = null;
const state = {
    library: [],
    activeDoc: null,
    activeTool: 0,
    eraserMode: 'pixel',
    tools: [
        { color: '#000000', weight: 3, type: 'pen' },
        { color: '#0000ff', weight: 3, type: 'pen' },
        { color: '#ff0000', weight: 3, type: 'pen' },
        { color: 'rgba(255, 220, 0, 0.5)', weight: 30, type: 'highlighter' },
        { type: 'eraser', weight: 25 }
    ],
    pages: [] // [{strokes: []}]
};

const penColors = ['#000000', '#00008b', '#ff0000', '#006400', '#800080', '#ffa500'];
const highColors = ['#ffff0088', '#ffa50088', '#90ee9088', '#add8e688', '#ffc0cb88'];

// --- File System Logic ---
async function initDirectory() {
    dirHandle = await window.showDirectoryPicker();
    document.getElementById('setup-view').classList.add('hidden');
    document.getElementById('library-view').classList.remove('hidden');
    refreshLibrary();
}

async function refreshLibrary() {
    state.library = [];
    for await (const entry of dirHandle.values()) {
        if (entry.name.endsWith('.pdf')) {
            state.library.push({ name: entry.name, handle: entry, isBlank: false });
        }
    }
    renderLibrary();
}

async function addNewPdf() {
    const [fileHandle] = await window.showOpenFilePicker({ types: [{ description: 'PDF Files', accept: {'application/pdf': ['.pdf']} }] });
    // This part is complex because we need to copy it into our selected directory
    // For this prototype, we'll just add it to the view
    state.library.push({ name: fileHandle.name, handle: fileHandle, isBlank: false });
    renderLibrary();
}

function renderLibrary() {
    const grid = document.getElementById('file-grid');
    grid.innerHTML = '';
    state.library.forEach(doc => {
        const card = document.createElement('div');
        card.className = 'pdf-card';
        card.onclick = () => openEditor(doc);
        card.innerHTML = `<div class="preview-container">PDF</div><div>${doc.name}</div>`;
        grid.appendChild(card);
    });
}

// --- Editor & Rendering ---
async function openEditor(doc) {
    state.activeDoc = doc;
    state.pages = [];
    document.getElementById('library-view').classList.add('hidden');
    document.getElementById('editor-view').classList.remove('hidden');
    const container = document.getElementById('document-container');
    container.innerHTML = '';

    const file = await doc.handle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 1.5 });
        const pageIdx = state.pages.length;
        state.pages.push({ strokes: [], redo: [] });

        const wrapper = document.createElement('div');
        wrapper.className = 'page-wrapper';
        wrapper.style.width = vp.width + 'px'; wrapper.style.height = vp.height + 'px';

        const bg = document.createElement('canvas');
        const fg = document.createElement('canvas');
        [bg, fg].forEach(c => { 
            c.width = vp.width * 2; c.height = vp.height * 2; 
            c.getContext('2d').scale(2,2); 
        });

        wrapper.append(bg, fg);
        container.appendChild(wrapper);
        await page.render({ canvasContext: bg.getContext('2d'), viewport: vp }).promise;
        initDrawing(fg, pageIdx);
    }
    selectTool(0);
}

// --- Drawing Logic ---
function initDrawing(canvas, pageIdx) {
    const ctx = canvas.getContext('2d');
    let isDrawing = false, currentStroke = null, start = null;

    canvas.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'pen' && e.buttons !== 1) return;
        isDrawing = true;
        start = { x: e.offsetX, y: e.offsetY };
        currentStroke = { tool: {...state.tools[state.activeTool]}, points: [start] };
    });

    canvas.addEventListener('pointermove', e => {
        if (!isDrawing) return;
        const x = e.offsetX, y = e.offsetY;
        if (currentStroke.tool.type === 'eraser' && state.eraserMode === 'stroke') {
            state.pages[pageIdx].strokes = state.pages[pageIdx].strokes.filter(s => 
                !s.points.some(p => Math.hypot(p.x - x, p.y - y) < 15)
            );
        } else if (currentStroke.tool.type === 'highlighter') {
            currentStroke.points = [start, {x, y}];
        } else {
            currentStroke.points.push({x, y});
        }
        render(ctx, pageIdx, currentStroke);
    });

    canvas.addEventListener('pointerup', () => {
        if (!isDrawing) return;
        isDrawing = false;
        if (currentStroke.tool.type !== 'eraser' || state.eraserMode === 'pixel') {
            state.pages[pageIdx].strokes.push(currentStroke);
        }
        render(ctx, pageIdx);
    });
}

function render(ctx, pageIdx, live = null) {
    ctx.clearRect(0, 0, ctx.canvas.width/2, ctx.canvas.height/2);
    const strokes = [...state.pages[pageIdx].strokes];
    if (live) strokes.push(live);

    strokes.forEach(s => {
        ctx.beginPath();
        ctx.lineWidth = s.tool.weight;
        ctx.strokeStyle = s.tool.color;
        ctx.lineCap = s.tool.type === 'highlighter' ? 'butt' : 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = s.tool.type === 'eraser' ? 'destination-out' : (s.tool.type === 'highlighter' ? 'multiply' : 'source-over');

        const pts = s.points;
        ctx.moveTo(pts[0].x, pts[0].y);
        if (s.tool.type === 'highlighter') {
            ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
        } else {
            for (let i = 1; i < pts.length - 2; i++) {
                const xc = (pts[i].x + pts[i+1].x) / 2;
                const yc = (pts[i].y + pts[i+1].y) / 2;
                ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
            }
            if (pts.length > 1) ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
        }
        ctx.stroke();
    });
}

// --- UI Logic ---
function selectTool(i) {
    state.activeTool = i;
    document.querySelectorAll('.tool-btn').forEach((b, idx) => b.classList.toggle('active', idx === i));
    document.getElementById('eraser-modes').classList.toggle('hidden', i !== 4);
    document.getElementById('color-palette').classList.toggle('hidden', i === 4);
    renderPalette();
}

function renderPalette() {
    const pal = document.getElementById('color-palette');
    pal.innerHTML = '';
    const colors = state.activeTool === 3 ? highColors : penColors;
    colors.forEach(c => {
        const s = document.createElement('div');
        s.className = 'color-swatch';
        s.style.background = c;
        s.onclick = () => { state.tools[state.activeTool].color = c; selectTool(state.activeTool); };
        pal.appendChild(s);
    });
}

function undo() { /* Implementation follows same render pattern */ }
function showLibrary() { 
    document.getElementById('editor-view').classList.add('hidden');
    document.getElementById('library-view').classList.remove('hidden');
}
