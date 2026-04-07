/**
 * Generator tool manifest.
 * Describes this tool to the tool registry / navigation system.
 *
 * @type {{
 *   id: string,
 *   label: string,
 *   workspace: string,
 *   icon: string,
 *   entry: string,
 * }}
 */
export default {
    id:        'generator',
    label:     'Generator',
    workspace: 'image',
    icon:      'generate',
    entry:     'js/workspaces/generator/generator.js',
};
