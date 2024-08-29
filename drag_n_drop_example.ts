import chroma from "chroma-js";
import { create } from "domain";
import Graph from "graphology";
import ForceSupervisor from "graphology-layout-force/worker";
import Sigma from "sigma";
import { v4 as uuid } from "uuid";

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

/// Parser
class Parser {
    forwards: Forward[];
    complete: Boolean;
    file_path: string;

    constructor(file_path: string) {
        this.forwards = []
        this.complete = false;
        this.file_path = file_path;

        console.log(this.file_path);
    }

    load_data() {
        let P = this;
        return new Promise<void>(function (resolve) {
            fetch(P.file_path).then((res) => res.text()).then((text) => {
                let lines = text.split("\n");
                let n = lines.length;
                for (let i = 1; i < lines.length; i++) {
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
                resolve();
            }).catch((e) => console.error(e));
        });
    }
};

// Retrieve the html document for sigma container
const container = document.getElementById("container") as HTMLElement;
const current_time_element = document.getElementById("current_time") as HTMLElement;
const num_nodes = 100;

// mock message data
const num_messages = 6000;

function create_mock_messages(num_messages) {
    let forward_messages = [];

    let time = 0;
    for (let i = 0; i < num_messages; i++) {
        time += Math.random();
        let from_chat_id = Math.floor(Math.random() * num_nodes);
        let to_chat_id = Math.floor(Math.random() * num_nodes);
        forward_messages.push({
            time: time,
            from_chat_id: from_chat_id,
            to_chat_id: to_chat_id
        });
    }
    return forward_messages;
}

//==============================================================================
// Visualization

function init_visualization(graph) {
    // Create the spring layout and start it
    const layout = new ForceSupervisor(graph, { isNodeFixed: (_, attr) => attr.highlighted });
    // // const layout = new ForceSupervisor(graph, { settings: { gravity: 3 } });
    layout.start();

    // Create the sigma
    const renderer = new Sigma(graph, container);

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

    return renderer;
}

//===============================================================
// Graph operations


function place_new_node(graph, node_label, x = 0, y = 0, noise = 1) {
    let xpos = x + noise * (Math.random() * 2 - 1);
    let ypos = y + noise * (Math.random() * 2 - 1);
    let color = chroma.random().hex();
    console.log(node_label);
    graph.addNode(node_label, { x: xpos, y: ypos, size: 3, color: color });

    return graph;
}

function place_new_edge(graph, node1, node2) {
    // if node1 = node2, do nothing
    if (node1 == node2) {
        return
    }

    // if none of the nodes exist, add them in the center with a random noise
    if (!graph.hasNode(node1) && !graph.hasNode(node2)) {
        place_new_node(graph, node1, 0, 0);
        place_new_node(graph, node2, 0, 0);
    }

    // if only one exists, add the other one close to it
    if (!graph.hasNode(node1) && graph.hasNode(node2)) {
        let node2_coords = graph.getNodeAttributes(node2, "x", "y");
        place_new_node(graph, node1, node2_coords.x, node2_coords.y);
    }

    if (graph.hasNode(node1) && !graph.hasNode(node2)) {
        let node1_coords = graph.getNodeAttributes(node1, "x", "y");
        place_new_node(graph, node2, node1_coords.x, node1_coords.y);
    }

    // if the edge does not exist, add it
    if (!graph.hasEdge(node1, node2) && !graph.hasEdge(node2, node1)) {
        graph.addEdge(node1, node2, { color: "#555555" });
    }

    return graph;
}

//===============================================================
// Telegram data

function to_simulation_time(real_time) {
    // how long should the simulation take in seconds
    let total_sim_time = 100.0;
    let miliseconds_per_year = 5 * 365 * 24 * 60 * 60 * 1000;
    // real time that corresponds to sim_time = 0
    let start_time = Date.parse("2020-06-06");
    let sim_time = total_sim_time * (real_time - start_time) / miliseconds_per_year;
    return sim_time;
}

function to_real_time(simulation_time) {
    // how long should the simulation take in seconds
    let total_sim_time = 100.0;
    let miliseconds_per_year = 5 * 365 * 24 * 60 * 60 * 1000;
    // real time that corresponds to sim_time = 0
    let start_time = Date.parse("2020-06-06");
    let real_time = start_time + simulation_time * miliseconds_per_year / total_sim_time;
    return real_time;
}

async function step(graph, time, forward_message) {
    let delta_time_real = forward_message.time - time;
    let delta_time_sim = to_simulation_time(delta_time_real);

    let node1 = forward_message.from_chat_id;
    let node2 = forward_message.to_chat_id;

    // sleep for time step
    await new Promise((resolve) => setTimeout(resolve, delta_time_sim * 1000));

    place_new_edge(graph, node1, node2);

    return graph;
}


let parse = new Parser("public/sv_forwards.csv");
await parse.load_data();
const forward_messages = parse.forwards;


(async () => {

    let graph = new Graph();
    init_visualization(graph);

    let sim_time = 0;
    let real_time = to_real_time(sim_time);
    let real_time_string = new Date(real_time).toLocaleDateString("de-DE");

    current_time_element.innerHTML = real_time_string;

    for (let i = 0; i < num_messages; i++) {
        let message = forward_messages[i];
        await step(graph, real_time, message);
        real_time = message.time;
        real_time_string = new Date(real_time).toLocaleDateString("de-DE");
        current_time_element.innerHTML = real_time_string;
        console.log(message);
        console.log(i);
    }
})();
