[Learn](/learn "Learn")[Advanced Use](/learn/advanced-use/hooks-providers "Advanced Use")Uncontrolled Flow

# Uncontrolled Flow

There are two ways to use React Flow - controlled or uncontrolled. Controlled means, that you are in control of the state of the nodes and edges. In an uncontrolled flow the state of the nodes and edges is handled by React Flow internally. In this part we will show you how to work with an uncontrolled flow.

An implementation of an uncontrolled flow is simpler, because you don’t need to pass any handlers:

As you can see, we are passing `defaultEdgeOptions` to define that edges are animated. This is helpful, because you can’t use the `onConnect` handler anymore to pass custom options to a newly created edge. Try to connect “Node B” with “Node C” and you see that the new edge is animated.

## Updating nodes and edges[](#updating-nodes-and-edges)

Since you don’t have nodes and edges in your local state, you can’t update them directly. To do so, you need to use the [React Flow instance](/api-reference/types/react-flow-instance) that comes with functions for updating the internal state. You can receive the instance via the `onInit` callback or better by using the [`useReactFlow` hook](/api-reference/hooks/use-react-flow). Let’s create a button that adds a new node at a random position. For this, we are wrapping our flow with the [`ReactFlowProvider`](/api-reference/react-flow-provider) and use the [`addNodes` function](/api-reference/types/react-flow-instance#nodes-and-edges).

The `Flow` component in this example is wrapped with the `ReactFlowProvider` to use the `useReactFlow` hook.

Last updated on August 24, 2026

[TypeScript](/learn/advanced-use/typescript "TypeScript")[Performance](/learn/advanced-use/performance "Performance")