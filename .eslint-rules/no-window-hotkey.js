module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow window.addEventListener for hotkeys; use Hotkeys.register',
      category: 'Best Practices',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        // Check if this is addEventListener call
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.property.type !== 'Identifier' ||
          node.callee.property.name !== 'addEventListener'
        ) {
          return;
        }

        // Check if object is 'window'
        if (
          node.callee.object.type !== 'Identifier' ||
          node.callee.object.name !== 'window'
        ) {
          return;
        }

        // Check if first argument is 'keydown' or 'keyup'
        if (node.arguments.length === 0) {
          return;
        }

        const firstArg = node.arguments[0];
        if (
          firstArg.type === 'Literal' &&
          (firstArg.value === 'keydown' || firstArg.value === 'keyup')
        ) {
          context.report({
            node,
            message: "Use 'Hotkeys.register' instead of 'window.addEventListener' for keyboard events",
          });
        }
      },
    };
  },
};
