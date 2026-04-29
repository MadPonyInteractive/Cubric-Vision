/**
 * Rule: catch dropped `Events.on()` unsubscribe handles.
 *
 * Events.on returns an unsubscribe function. Throwing it away leaks the
 * listener for the lifetime of the bus. The previous file-level heuristic
 * (require el.destroy) only worked for components and false-flagged static
 * APIs (MpiContextMenu.show), services, shell modules, and routes.
 *
 * New approach: flag any Events.on(...) call whose return value is
 * DISCARDED — i.e. parent is ExpressionStatement. Allowed parents:
 *   - VariableDeclarator    `const u = Events.on(...)`
 *   - AssignmentExpression  `unsub = Events.on(...)`
 *   - CallExpression arg    `_unsubs.push(Events.on(...))`
 *   - ArrayExpression       `[Events.on(...), ...]`
 *   - Property value        `{ unsub: Events.on(...) }`
 *   - ReturnStatement       `return Events.on(...)`
 *   - LogicalExpression / ConditionalExpression / SequenceExpression
 *
 * Bare `Events.on('x', fn);` is the leak signal.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow discarding the unsubscribe handle returned by Events.on()',
      category: 'Best Practices',
    },
  },
  create(context) {
    function isEventsOn(node) {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'on' &&
        (
          // Direct: Events.on(...)
          (node.callee.object.type === 'Identifier' && node.callee.object.name === 'Events') ||
          // Channel: someBus.on(...) where someBus = Events.channel(...)
          // Heuristic: variable name ends with 'Bus' or 'Events' or 'Channel'
          (
            node.callee.object.type === 'Identifier' &&
            /(Bus|Events|Channel)$/i.test(node.callee.object.name) &&
            node.callee.object.name !== 'this'
          )
        )
      );
    }

    return {
      CallExpression(node) {
        if (!isEventsOn(node)) return;
        // ESLint v9+ exposes node.parent. Fallback to sourceCode for safety.
        const parent = node.parent
          || (context.sourceCode && context.sourceCode.getAncestors
              ? context.sourceCode.getAncestors(node).slice(-1)[0]
              : null);
        if (parent && parent.type === 'ExpressionStatement') {
          context.report({
            node,
            message:
              'Discarded Events.on() unsubscribe — store it (const u = ...) or push to a cleanup array. Memory leak.',
          });
        }
      },
    };
  },
};
