const state = {
    activeTool: 0,
    tools: [
        { color: '#000000', weight: 3, type: 'pen' },   // Pen 1
        { color: '#0000ff', weight: 3, type: 'pen' },   // Pen 2
        { color: '#ff0000', weight: 3, type: 'pen' },   // Pen 3
        { color: '#ffff00', weight: 25, type: 'highlighter' }
    ],
    isCollapsed: false
};

const penColors = ['#add8e6', '#00008b', '#000000', '#ff0000', '#90ee90', '#006400', '#e6e6fa', '#800080', '#ffa500', '#40e0d0'];
const highColors = ['#ffff00', '#ffa500', '#90ee90', '#add8e6', '#ffc0cb'];

document.addEventListener('DOMContentLoaded', () => {
    addNewPage(); // Create first page
    renderPalette();
});

function selectTool(index) {
    state.activeTool = index;
    document.querySelectorAll('.tool-btn').forEach((b, i) => b.classList.toggle('active', i === index));
    renderPalette();
    updateToolControls();
}

function renderPalette() {
    const palette = document.getElementById('color-palette');
    palette.innerHTML = '';
    const colors = state.activeTool === 3 ? highColors : penColors;
    
    colors.forEach(c => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch' + (state.tools[state.activeTool].color === c ? ' active' : '');
        swatch.style.backgroundColor = c;
        swatch.onclick = () => {
            state.tools[state.activeTool].color = c;
            renderPalette();
        };
        palette.appendChild(swatch);
    });
}

function updateToolControls() {
    const tool = state.tools[state.activeTool];
    document.getElementById('weightSlider').value = tool.weight;
    document.getElementById('weightLabel').innerText = tool.weight + 'px';
}

document.getElementById('weightSlider').oninput = (e) => {
    state.tools[state.activeTool].weight = parseInt(e.target.value);
    document.getElementById('weightLabel').innerText = e.target.value + 'px';
};

function toggleMenu() {
    state.isCollapsed = !state.isCollapsed;
    document.getElementById('toolbar').classList.toggle('collapsed', state.isCollapsed);
    document.getElementById('menu-dot').classList.toggle('hidden', !state.isCollapsed);
}

// Drawing Engine
function initCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = 816; canvas.height = 1056;
    let isDrawing = false;
    let points = [];

    canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'pen' && e.buttons !== 1) return;
        isDrawing = true;
        const tool = state.tools[state.activeTool];
        
        ctx.strokeStyle = tool.type === 'highlighter' ? tool.color + '66' : tool.color;
        ctx.lineWidth = tool.weight;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = tool.type === 'highlighter' ? 'multiply' : 'source-over';
        
        points = [{ x: e.offsetX, y: e.offsetY }];
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!isDrawing) return;
        points.push({ x: e.offsetX, y: e.offsetY });

        if (points.length > 2) {
            ctx.beginPath();
            ctx.moveTo(points[points.length - 3].x, points[points.length - 3].y);
            const midPoint = {
                x: (points[points.length - 2].x + points[points.length - 1].x) / 2,
                y: (points[points.length - 2].y + points[points.length - 1].y) / 2
            };
            ctx.quadraticCurveTo(points[points.length - 2].x, points[points.length - 2].y, midPoint.x, midPoint.y);
            ctx.stroke();
        }
    });

    canvas.addEventListener('pointerup', () => isDrawing = false);
}

function addNewPage() {
    const container = document.getElementById('document-container');
    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.innerHTML = `<canvas class="draw-layer"></canvas>`;
    container.appendChild(wrapper);
    initCanvas(wrapper.querySelector('.draw-layer'));
}

// Auto-add page on scroll
document.getElementById('document-container').onscroll = (e) => {
    if (e.target.scrollHeight - e.target.scrollTop <= e.target.clientHeight + 10) {
        addNewPage();
    }
};
