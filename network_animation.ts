import Graph from "graphology";
import ForceSupervisor from "graphology-layout-force/worker";
import Sigma from "sigma";


// const scale_exp_decay = 0.000001;
const scale_exp_decay = 0.00000001;
const log_thresh = -5000;
// wall-clock duration of the whole animation, in seconds
const animation_duration_s = 100;
// cap on the wall-clock time advanced per frame, so that e.g. a hidden tab doesn't cause a jump
const max_frame_ms = 100;

class Forward {
    time: number; // ms since 1.1.1970
    from_chat_id: number;
    to_chat_id: number;

    constructor(t: number, from: number, to: number) {
        this.time = t;
        this.from_chat_id = from;
        this.to_chat_id = to;
    }
}

class Chat {
    id: number;
    lang: string;
    name: string;

    constructor(id: number, name: string, lang: string) {
        this.id = id;
        this.lang = lang;
        this.name = name;
    }
}

/// Parser
class Parser {
    forwards: Forward[];
    chats: Chat[];
    fwd_path: string;
    chat_path: string;

    constructor(fwd_path: string, chat_path: string) {
        this.forwards = [];
        this.chats = [];
        this.fwd_path = fwd_path;
        this.chat_path = chat_path;

        console.log(this.fwd_path);
    }

    load_data() {
        let P = this;
        return new Promise<void>(function (resolve) {
            // load the forward data
            fetch(P.fwd_path).then((res) => res.text()).then((text) => {
                let lines = text.split("\n");
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].trim() === "") continue;
                    let parts = lines[i].split(',');
                    let from = parseInt(parts[1]);
                    let to = parseInt(parts[2]);
                    let date = Date.parse(parts[3]);
                    let fwd = new Forward(date, from, to);
                    P.forwards.push(fwd);
                }
                // sort the forwards
                P.forwards.sort((a: Forward, b: Forward) => {
                    return a.time - b.time;
                })
                // load chat data
                fetch(P.chat_path).then((res) => res.text()).then((text) => {
                    let lines = text.split("\n");
                    for (let i = 1; i < lines.length; i++) {
                        if (lines[i].trim() === "") continue;
                        let parts = lines[i].split(',');
                        let id = parseInt(parts[2]);
                        let name = parts[4];
                        let lang = parts[5];
                        let chat = new Chat(id, name, lang);
                        P.chats.push(chat);
                    }
                    resolve();
                });
            }).catch((e) => console.error(e));
        });
    }
};

// Retrieve the html document for sigma container
const container = document.getElementById("container") as HTMLElement;
const current_time_element = document.getElementById("current_time") as HTMLElement;
const pausePlayBtn = document.getElementById("pause-play-btn") as HTMLButtonElement;
const restartBtn = document.getElementById("restart-btn") as HTMLButtonElement;

// Animation control state
let isPaused = false;
let animationResolver: (() => void) | null = null;
let shouldRestart = false;
let isAnimationComplete = false;

//==============================================================================
// Visualization

function init_visualization(graph) {
    // Create the spring layout and start it
    const layout = new ForceSupervisor(graph, { isNodeFixed: (_, attr) => attr.highlighted, settings: { gravity: 0.0001, maxMove: 2, inertia: 0.85 } });
    // // const layout = new ForceSupervisor(graph, { settings: { gravity: 3 } });
    layout.start();

    // Create the sigma with settings to hide labels by default
    const renderer = new Sigma(graph, container, {
        renderLabels: false, // Hide all labels by default
        renderEdgeLabels: false
    });

    enable_drag_n_drop(graph, renderer);

    return renderer;
}

function enable_drag_n_drop(graph, renderer) {
    // State for drag'n'drop
    let draggedNode: string | null = null;
    let isDragging = false;

    // On mouse down on a node
    //  - we enable the drag mode
    //  - save in the dragged node in the state
    //  - highlight the node
    //  - disable the camera so its state is not updated
    renderer.on("downNode", (e) => {
        isDragging = true;
        draggedNode = e.node;
        graph.setNodeAttribute(draggedNode, "highlighted", true);
    });

    // On mouse move, if the drag mode is enabled, we change the position of the draggedNode
    renderer.getMouseCaptor().on("mousemovebody", (e) => {
        if (!isDragging || !draggedNode) return;

        // Get new position of node
        const pos = renderer.viewportToGraph(e);

        graph.setNodeAttribute(draggedNode, "x", pos.x);
        graph.setNodeAttribute(draggedNode, "y", pos.y);

        // Prevent sigma to move camera:
        e.preventSigmaDefault();
        e.original.preventDefault();
        e.original.stopPropagation();
    });

    // On mouse up, we reset the autoscale and the dragging mode
    renderer.getMouseCaptor().on("mouseup", () => {
        if (draggedNode) {
            graph.removeNodeAttribute(draggedNode, "highlighted");
        }
        isDragging = false;
        draggedNode = null;
    });

    // Disable the autoscale at the first down interaction
    renderer.getMouseCaptor().on("mousedown", () => {
        if (!renderer.getCustomBBox()) renderer.setCustomBBox(renderer.getBBox());
    });

    // open links on right click
    renderer.on("rightClickNode", (e) => {
        window.open("https://t.me/" + graph.getNodeAttributes(e.node).label, '_blank');
    });

    // Show label on hover
    renderer.on("enterNode", (e) => {
        graph.setNodeAttribute(e.node, "forceLabel", true);
    });

    // Hide label when not hovering
    renderer.on("leaveNode", (e) => {
        graph.removeNodeAttribute(e.node, "forceLabel");
    });

    return renderer;
}

//===============================================================
// Graph operations


function place_new_node(graph, node_id, x = 0, y = 0, noise = 1) {
    let xpos = x + noise * (Math.random() * 2 - 1);
    let ypos = y + noise * (Math.random() * 2 - 1);
    //let color = chroma.random().hex();
    // color according to language
    let node_color = color[node_id];
    graph.addNode(node_id, {
        x: xpos, y: ypos, color: node_color, label: names[node_id],
    });

    return graph;
}

function place_some_edge(graph, node1_id, node2_id, Tnow) {
    // if node1 = node2, do nothing
    if (node1_id == node2_id) {
        return
    }

    // if none of the nodes exist, add them in the center with a random noise
    if (!graph.hasNode(node1_id) && !graph.hasNode(node2_id)) {
        place_new_node(graph, node1_id, 0, 0);
        place_new_node(graph, node2_id, 0, 0);
    }

    // if only one exists, add the other one close to it
    if (!graph.hasNode(node1_id) && graph.hasNode(node2_id)) {
        let node2_coords = graph.getNodeAttributes(node2_id, "x", "y");
        place_new_node(graph, node1_id, node2_coords.x, node2_coords.y);
    }

    if (graph.hasNode(node1_id) && !graph.hasNode(node2_id)) {
        let node1_coords = graph.getNodeAttributes(node1_id, "x", "y");
        place_new_node(graph, node2_id, node1_coords.x, node1_coords.y);
    }

    // links are undirected: update the edge in whichever direction it was created
    let edge = graph.edge(node1_id, node2_id) ?? graph.edge(node2_id, node1_id);
    if (edge !== undefined) {
        graph.updateEdgeAttributes(edge, attr => {
            return {
                ...attr,
                // size: 1 + Math.log(attr.weight + 1),
                size: 1 + attr.log_A,
                weight: (attr.weight || 0) + 1,
                log_A: Math.log(1 + Math.exp(attr.log_A) * Math.exp(-scale_exp_decay * (Tnow - attr.Tlast))),
                Tlast: Tnow,
            };
        });
    } else {
        // if the edge does not exist, add it
        let style = getComputedStyle(document.body);
        let edge_color = style.getPropertyValue('--text-light');
        graph.addEdge(node1_id, node2_id, { color: edge_color, weight: 1, log_A: 0, Tlast: Tnow });
    }

    return graph;
}

//===============================================================
// Telegram data

function next_frame() {
    return new Promise<number>((resolve) => requestAnimationFrame(resolve));
}

function setAnimationComplete() {
    isAnimationComplete = true;
    isPaused = true;
    pausePlayBtn.innerHTML = 'Play';
    pausePlayBtn.disabled = true;
    pausePlayBtn.style.opacity = '0.5';
    pausePlayBtn.style.cursor = 'not-allowed';
    console.log("Animation completed - all timestamps processed");
}

function resetAnimationState() {
    isAnimationComplete = false;
    isPaused = false;
    pausePlayBtn.innerHTML = 'Pause';
    pausePlayBtn.disabled = false;
    pausePlayBtn.style.opacity = '1';
    pausePlayBtn.style.cursor = 'pointer';
}

// Setup pause/play button functionality
function setupPausePlayButton() {
    pausePlayBtn.addEventListener('click', () => {
        // Don't allow play if animation is complete
        if (isAnimationComplete) {
            return;
        }

        isPaused = !isPaused;

        if (isPaused) {
            pausePlayBtn.innerHTML = 'Play';
            // pausePlayBtn.style.background = '#f44336';
        } else {
            pausePlayBtn.innerHTML = 'Pause';
            // pausePlayBtn.style.background = '#4CAF50';

            // Resume animation if it was waiting
            if (animationResolver) {
                animationResolver();
                animationResolver = null;
            }
        }
    });

    restartBtn.addEventListener('click', () => {
        shouldRestart = true;

        // Reset animation state when restarting
        resetAnimationState();

        // If paused, resume to allow restart to proceed
        if (isPaused && animationResolver) {
            animationResolver();
            animationResolver = null;
        }

        // Reset pause state
        isPaused = false;
        pausePlayBtn.innerHTML = 'Pause';
    });
}


let parse = new Parser("public/scandinavian_forwards.csv", "public/scandinavian_chats.csv");
await parse.load_data();
const forward_messages = parse.forwards;
let color = new Array(parse.chats.length);
let names = new Array(parse.chats.length);
/*
 Make an array: chat_id => color
*/
function lang_to_color(l: string) {
    if (l == "sv") {
        return "#FFCD00";
    }
    if (l == "no") {
        return "#BA0C2F";
    }
    if (l == "fi") {
        return "rgb(50, 204, 255)";
    }
    if (l == "da") {
        return "rgb(244, 142, 59)";
    }
    return "black";
}

for (let i = 0; i < color.length; i++) {
    let id = parse.chats[i].id;
    color[id] = lang_to_color(parse.chats[i].lang);
    names[id] = parse.chats[i].name;
}

function show_time(real_time) {
    current_time_element.innerHTML = new Date(real_time).toLocaleDateString("de-DE");
}

async function runAnimation(graph) {
    const n = forward_messages.length;
    const start_time = forward_messages[0].time;
    const end_time = forward_messages[n - 1].time;
    // data milliseconds per wall-clock millisecond
    const speed = (end_time - start_time) / (animation_duration_s * 1000);

    let real_time = start_time;
    let i = 0;
    show_time(real_time);

    let last_frame = await next_frame();
    while (i < n) {
        const now = await next_frame();
        if (shouldRestart) {
            throw new Error("RESTART_REQUESTED");
        }

        if (isPaused) {
            await new Promise<void>((resolve) => {
                animationResolver = resolve;
            });
            last_frame = await next_frame(); // don't count the paused time
            continue;
        }

        real_time += Math.min(now - last_frame, max_frame_ms) * speed;
        last_frame = now;

        // add all forwards that happened up to the current time
        while (i < n && forward_messages[i].time <= real_time) {
            const message = forward_messages[i];
            place_some_edge(graph, message.from_chat_id, message.to_chat_id, message.time);
            i++;
        }
        show_time(Math.min(real_time, end_time));

        graph.forEachNode((node) => {
            graph.mergeNodeAttributes(node, {
                size: 3 * (1 + Math.log(1 + graph.degree(node)))
                // size: 2.1 + 0.85 * Math.sqrt(graph.degree(node))
            });
        });
        graph.forEachEdge((edge) => {
            if (scale_exp_decay * (real_time - graph.getEdgeAttribute(edge, "Tlast")) > graph.getEdgeAttribute(edge, "log_A") - log_thresh) {
                graph.dropEdge(edge);
            };
        });
    }

    // Animation completed - set the completion state
    setAnimationComplete();
}

(async () => {
    let graph = new Graph();
    let renderer = init_visualization(graph);

    // Setup pause/play functionality
    setupPausePlayButton();

    while (true) {
        try {
            // Reset restart flag
            shouldRestart = false;

            // Clear the graph for restart
            graph.clear();

            await runAnimation(graph);

            // If we reach here, animation completed normally
            // Wait for restart instead of breaking
            await new Promise<void>((resolve) => {
                const waitForRestart = () => {
                    if (shouldRestart) {
                        resolve();
                    } else {
                        setTimeout(waitForRestart, 100);
                    }
                };
                waitForRestart();
            });
        } catch (error) {
            if (error.message === "RESTART_REQUESTED") {
                console.log("Restarting animation...");
                continue; // Restart the loop
            } else {
                console.error("Animation error:", error);
                break;
            }
        }
    }
})();
