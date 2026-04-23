module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require el.destroy cleanup when using Events.on()',
      category: 'Best Practices',
    },
  },
  create(context) {
    let hasEventsOn = false;
    let hasElDestroy = false;

    return {
      Program(node) {
        // Reset for each file
        hasEventsOn = false;
        hasElDestroy = false;
      },

      CallExpression(node) {
        // Check for Events.on(...) call
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'Events' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'on'
        ) {
          hasEventsOn = true;
        }
      },

      AssignmentExpression(node) {
        // Check for el.destroy = ...
        if (
          node.left.type === 'MemberExpression' &&
          node.left.object.type === 'Identifier' &&
          node.left.object.name === 'el' &&
          node.left.property.type === 'Identifier' &&
          node.left.property.name === 'destroy'
        ) {
          hasElDestroy = true;
        }
      },

      'Program:exit'(node) {
        if (hasEventsOn && !hasElDestroy) {
          context.report({
            node,
            message:
              'File uses Events.on() but does not define el.destroy — memory leak risk',
          });
        }
      },
    };
  },
};
