// export {};
import Graph from 'graphology';
import Sigma from 'sigma';

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const graph = new Graph();
graph.addNode("1", { label: "Node 1", x: 0, y: 0, size: 10, color: "blue" });
graph.addNode("2", { label: "Node 2", x: 1, y: 1, size: 20, color: "red" });
graph.addEdge("1", "2", { size: 5, color: "purple" });

// Instantiate sigma.js and render the graph
const sigmaInstance = new Sigma(graph, document.getElementById("container"));
await delay(1000)
graph.addNode("3", { label: "Node 3", x: 0, y: 1, size: 20, color: "yellow" });
await delay(1000)
graph.addEdge("1", "3", { size: 5, color: "purple" });
