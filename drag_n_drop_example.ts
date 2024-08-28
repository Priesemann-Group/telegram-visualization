import chroma from "chroma-js";
import Graph from "graphology";
import ForceSupervisor from "graphology-layout-force/worker";
import Sigma from "sigma";
import { v4 as uuid } from "uuid";

// import { onStoryDown } from "../utils";

// Retrieve the html document for sigma container
const container = document.getElementById("container") as HTMLElement;

// Create a sample graph
const graph = new Graph();
const num_nodes = 350;
for (let i = 0; i < num_nodes; i++) {
    // generate a node at a random position in [-1, 1], a random color and connected to two random other nodes
    let xpos = Math.random() * 2 - 1;
    let ypos = Math.random() * 2 - 1;
    let color = chroma.random().hex();
    graph.addNode(`n${i}`, { x: xpos, y: ypos, size: 3, color: color });
}

for (let i = 0; i < num_nodes * 10; i++) {

    let first_neighbor_id = Math.floor(Math.random() * num_nodes);
    let second_neighbor_id = Math.floor(Math.random() * num_nodes);

    if (first_neighbor_id == second_neighbor_id) {
        continue;
    }

    let first_neighbor = `n${first_neighbor_id}`;
    let second_neighbor = `n${second_neighbor_id}`;

    try {
        graph.addEdge(first_neighbor, second_neighbor);
    } catch (e) {
        continue;
    }
}

// Create the spring layout and start it
const layout = new ForceSupervisor(graph, { isNodeFixed: (_, attr) => attr.highlighted });
// const layout = new ForceSupervisor(graph, { settings: { gravity: 3 } });
layout.start();

// Create the sigma
const renderer = new Sigma(graph, container);

//
// Drag'n'drop feature
// ~~~~~~~~~~~~~~~~~~~
//

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