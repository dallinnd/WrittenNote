const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const state = {
    library: [],
    activeDoc: null,
    activeTool: 0,
    eraserMode: 'pixel', 
    tools: [
        { color: '#000000', weight: 3, type: 'pen' },
        { color: '#0000ff', weight: 3, type: 'pen' },
        { color: '#ff0000', weight: 3, type: 'pen' },
        { color: 'rgba(255, 255, 0, 0.5)', weight: 30, type: 'highlighter' },
        { type: 'eraser', weight: 20 }
    ],
    pages: [] // Holds { strokes: [], redo: [] } for each page
};

const penColors = ['#add8e6', '#00008b', '#000000', '#ff0000', '#90ee90', '#006400', '#e6e6fa', '#800080', '#ffa500', '#40e0d0'];
const highColors = ['#ffff00', '#ffa500', '#90ee90', '#add8e6', '#ffc0cb'];

// --- Library Functions ---
document.getElementById('pdf-upload').onchange = async (e) => {
    const file = e.target.files[0];
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdfDoc.getPage(1);
    const canvas = document.createElement('canvas');
    const viewport = page.getViewport({ scale: 0.2 });
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    state.library.push({ id: Date.now(), name: file.name, data: arrayBuffer, isBlank: false, thumbnail: canvas.toDataURL() });
    renderLibrary();
};

function createNewBlank() {
    const name = prompt("Name:", "New Notebook");
    if (name) {
        const doc = { id: Date.now(), name, data: null, isBlank: true, thumbnail: "" };
        state.library.push(doc);
        renderLibrary();
        openEditor(doc);
    }
}

function renderLibrary() {
    const grid = document.getElementById('file-grid');
    grid.innerHTML = '';
    state.library.forEach(doc => {
        const card = document.createElement('div');
        card.className = 'pdf-card';
        card.onclick = () => openEditor(doc);
        card.innerHTML = `<div class="preview-container">${doc.isBlank ? '' : `<img src="${doc.thumbnail}" style="width:100%">`}</div><div class="file-name">${doc.name}</div>`;
        grid.appendChild(card);
    });
}

// --- Editor Logic ---
async function openEditor(doc) {
    state.activeDoc = doc;
    state.pages = [];
    document.getElementById('library-view').classList.add('hidden');
    document.getElementById('editor-view').classList.remove('hidden');
    const container = document.getElementById('document-container');
    container.innerHTML = '';

    if (doc.isBlank) {
        addEditorPage(container, 816, 1056);
    } else {
        const pdfDoc = await pdfjsLib.getDocument({ data: doc.data }).promise;
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const vp = page.getViewport({ scale: 1.5 });
            const { bg } = addEditorPage(container, vp.width, vp.height);
            await page.render({ canvasContext: bg.getContext('2d'), viewport: vp }).promise;
        }
    }
}

function addEditorPage(container, w, h) {
    const pageIdx = state.pages.length;
    state.pages.push({ strokes: [], redo: [] });

    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.style.width = w + 'px'; wrapper.style.height = h + 'px';

    const bg = document.createElement('canvas');
    const fg = document.createElement('canvas');
    fg.className = 'draw-layer';
    
    // High DPI Scaling
    [bg, fg].forEach(c => {
        c.width = w * 2; c.height = h * 2; // Render at 2x
        c.getContext('2d').scale(2, 2);
    });

    wrapper.append(bg, fg);
    container.appendChild(wrapper);
    initDrawing(fg, pageIdx);
    return { bg, fg };
}

// --- Vector Drawing Engine ---
function initDrawing(canvas, pageIdx) {
    const ctx = canvas.getContext('2d');
    let isDrawing = false, currentStroke = null, startPt = null;

    canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'pen' && e.buttons !== 1) return;
        isDrawing = true;
        const tool = {...state.tools[state.activeTool]};
        startPt = { x: e.offsetX, y: e.offsetY };
        currentStroke = { tool, points: [startPt] };
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!isDrawing) return;
        const x = e.offsetX, y = e.offsetY;
        const tool = currentStroke.tool;

        if (tool.type === 'eraser' && state.eraserMode === 'stroke') {
            state.pages[pageIdx].strokes = state.pages[pageIdx].strokes.filter(s => 
                !s.points.some(p => Math.hypot(p.x - x, p.y - y) < tool.weight/2)
            );
        } else if (tool.type === 'highlighter') {
            currentStroke.points = [startPt, {x, y}];
        } else {
            currentStroke.points.push({x, y});
        }
        render(ctx, pageIdx, isDrawing ? currentStroke : null);
    });

    canvas.addEventListener('pointerup', () => {
        if (!isDrawing) return;
        isDrawing = false;
        if (currentStroke.tool.type !== 'eraser' || state.eraserMode === 'pixel') {
            state.pages[pageIdx].strokes.push(currentStroke);
            state.pages[pageIdx].redo = [];
        }
        render(ctx, pageIdx);
    });
}

function render(ctx, pageIdx, liveStroke = null) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const strokes = [...state.pages[pageIdx].strokes];
    if (liveStroke) strokes.push(liveStroke);

    strokes.forEach(s => {
        ctx.beginPath();
        ctx.lineWidth = s.tool.weight;
        ctx.strokeStyle = s.tool.color;
        ctx.lineCap = s.tool.type === 'highlighter' ? 'butt' : 'round';
        ctx.lineJoin = 'round';
        
        if (s.tool.type === 'eraser' && state.eraserMode === 'pixel') {
            ctx.globalCompositeOperation = 'destination-out';
        } else if (s.tool.type === 'highlighter') {
            ctx.globalCompositeOperation = 'multiply';
            ctx.strokeStyle = s.tool.color.includes('rgba') ? s.tool.color : s.tool.color + '88';
        } else {
            ctx.globalCompositeOperation = 'source-over';
        }

        const pts = s.points;
        if (pts.length < 2) return;

        if (s.tool.type === 'highlighter') {
            ctx.moveTo(pts[0].x, pts[0].y);
            ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
        } else {
            // Quadratic Smoothing
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length - 2; i++) {
                const xc = (pts[i].x + pts[i+1].x) / 2;
                const yc = (pts[i].y + pts[i+1].y) / 2;
                ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
            }
            ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
        }
        ctx.stroke();
    });
}

// --- History & UI ---
function undo() {
    state.pages.forEach((p, i) => {
        if (p.strokes.length) {
            p.redo.push(p.strokes.pop());
            const canvas = document.querySelectorAll('.draw-layer')[i];
            render(canvas.getContext('2d'), i);
        }
    });
}

function redo() {
    state.pages.forEach((p, i) => {
        if (p.redo.length) {
            p.strokes.push(p.redo.pop());
            const canvas = document.querySelectorAll('.draw-layer')[i];
            render(canvas.getContext('2d'), i);
        }
    });
}

function selectTool(i) {
    state.activeTool = i;
    document.querySelectorAll('.tool-btn').forEach((btn, idx) => btn.classList.toggle('active', idx === i));
    document.getElementById('eraser-modes').classList.toggle('hidden', i !== 4);
    document.getElementById('color-palette').classList.toggle('hidden', i === 4);
    updateControls();
}

function setEraserMode(m) {
    state.eraserMode = m;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.id.includes(m)));
}

function updateControls() {
    const t = state.tools[state.activeTool];
    document.getElementById('weightSlider').value = t.weight;
    document.getElementById('weightLabel').innerText = t.weight + 'px';
    renderPalette();
}

function renderPalette() {
    const pal = document.getElementById('color-palette');
    pal.innerHTML = '';
    const colors = state.activeTool === 3 ? highColors : penColors;
    colors.forEach(c => {
        const s = document.createElement('div');
        s.className = 'color-swatch' + (state.tools[state.activeTool].color === c ? ' active' : '');
        s.style.background = c;
        s.onclick = () => { state.tools[state.activeTool].color = c; renderPalette(); };
        pal.appendChild(s);
    });
}

document.getElementById('weightSlider').oninput = (e) => {
    state.tools[state.activeTool].weight = e.target.value;
    document.getElementById('weightLabel').innerText = e.target.value + 'px';
};

function showLibrary() {
    document.getElementById('library-view').classList.remove('hidden');
    document.getElementById('editor-view').classList.add('hidden');
}

function toggleMenu() {
    state.isCollapsed = !state.isCollapsed;
    document.getElementById('toolbar').classList.toggle('collapsed', state.isCollapsed);
    document.getElementById('menu-dot').classList.toggle('hidden', !state.isCollapsed);
}
