"""Check a bench graph against the bench's own /object_info before dispatching.

Cheap insurance: a mistyped weight name or a missing required input costs a
15-minute run and comes back as a wall of traceback. This catches both in a
second, and it reads the answer off the SERVER rather than off a schema file
that may not describe the install actually running.
"""
import json
import sys
import urllib.request

BENCH = 'http://127.0.0.1:8188'


def check_int_widget_limits(graph, info, bad):
    """An MpiInt feeding a numeric widget escapes that widget's own min/max/step.

    This cost a full dispatch on 2026-09-09: #167/#168 carried 960x400 into
    MpiH3ImageToVideo, which declares step 32. 400 is not a multiple of 32, so the
    latent grid came out ODD (400/16 = 25) and the DiT's 2x2 patchify died inside
    SamplerCustomAdvanced with a reshape error 30 s in - a failure mode that names
    neither node and looks nothing like a size problem.

    The widget would have refused it in the UI. A link bypasses the widget, so the
    only place left to check is here.
    """
    for nid, node in sorted(graph.items(), key=lambda x: int(x[0])):
        cls = node['class_type']
        if cls not in info:
            continue
        spec = info[cls]['input']
        allowed = dict(spec.get('required', {}))
        allowed.update(spec.get('optional', {}))

        for name, val in node['inputs'].items():
            if not (isinstance(val, list) and len(val) == 2):
                continue
            src = graph.get(str(val[0]))
            if not src or src['class_type'] != 'MpiInt':
                continue
            n = src['inputs'].get('int')
            opts = allowed.get(name)
            if not isinstance(n, int) or not opts or not isinstance(opts[1], dict):
                continue
            rules = opts[1]
            where = '#%s %s.%s <- #%s MpiInt %d' % (nid, cls, name, val[0], n)
            step = rules.get('step')
            if step and n % step:
                bad.append('%s: NOT a multiple of step %d (nearest %d / %d)'
                           % (where, step, n - n % step, n - n % step + step))
            if 'min' in rules and n < rules['min']:
                bad.append('%s: below min %s' % (where, rules['min']))
            if 'max' in rules and n > rules['max']:
                bad.append('%s: above max %s' % (where, rules['max']))


def main(graph_path):
    graph = json.load(open(graph_path))
    info = json.load(urllib.request.urlopen(BENCH + '/object_info', timeout=120))
    bad = []

    for nid, node in sorted(graph.items(), key=lambda x: int(x[0])):
        cls = node['class_type']
        if cls not in info:
            bad.append('#%s %s: NOT INSTALLED on this bench' % (nid, cls))
            continue
        spec = info[cls]['input']
        req = spec.get('required', {})
        allowed = dict(req)
        allowed.update(spec.get('optional', {}))

        for name in req:
            if name not in node['inputs']:
                bad.append('#%s %s: missing required input %r' % (nid, cls, name))

        for name, val in node['inputs'].items():
            if name not in allowed:
                # autogrow / dotted slots (mode.width) are legal and not listed flat
                if '.' not in name:
                    bad.append('#%s %s: unknown input %r' % (nid, cls, name))
                continue
            if isinstance(val, list) and len(val) == 2:          # a link
                tgt = str(val[0])
                if tgt not in graph:
                    bad.append('#%s %s.%s -> #%s which is not in the graph'
                               % (nid, cls, name, tgt))
                    continue
                tgt_cls = graph[tgt]['class_type']
                if tgt_cls not in info:
                    continue                                     # already reported
                outs = info[tgt_cls]['output']
                if val[1] >= len(outs):
                    bad.append('#%s %s.%s -> #%s output %d, but it has %d'
                               % (nid, cls, name, tgt, val[1], len(outs)))
                continue
            opts = allowed[name][0]
            if isinstance(opts, list) and val not in opts:       # a combo widget
                near = [o for o in opts if isinstance(o, str)
                        and str(val).split('\\')[-1][:14].lower() in o.lower()]
                bad.append('#%s %s.%s = %r NOT OFFERED. %s'
                           % (nid, cls, name, val,
                              ('did you mean %s?' % near[:3]) if near
                              else '%d options, none close' % len(opts)))

    check_int_widget_limits(graph, info, bad)

    print('%d nodes checked against %d installed classes' % (len(graph), len(info)))
    if bad:
        print('\n'.join('  ' + b for b in bad))
        sys.exit('%d PROBLEM(S) - do not dispatch' % len(bad))
    print('OK - every class installed, every required input wired, every weight offered')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'arm_a1_bare.json')
