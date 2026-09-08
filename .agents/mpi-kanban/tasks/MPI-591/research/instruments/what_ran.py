"""What did the bench ACTUALLY execute for this prompt_id?

Arriving is not taking effect: the only ground truth for a dispatched run is the
graph ComfyUI echoes back in /history, not the file that was posted. Print the
turbo switch, both sampler arms and every node the turbo boolean reaches.
"""
import json
import sys
import urllib.request

BENCH = 'http://127.0.0.1:8188'
WATCH = ('MpiSimpleBoolean', 'MpiLoraModel', 'MpiLoraModelClip', 'BasicScheduler',
         'KSamplerSelect', 'ModelSamplingSD3', 'ImpactSwitch', 'MpiSwitch', 'Switch',
         'CLIPLoader', 'SamplerCustomAdvanced')


def main(pid):
    hist = json.load(urllib.request.urlopen('%s/history/%s' % (BENCH, pid), timeout=60))
    g = hist[pid]['prompt'][2]          # the executed prompt, as the server stored it
    print('executed graph: %d nodes' % len(g))

    print('\n-- turbo switch --')
    for k, n in sorted(g.items(), key=lambda x: int(x[0])):
        if n['class_type'] == 'MpiSimpleBoolean':
            print('  #%s %s' % (k, n['inputs']))

    print('\n-- who consumes it --')
    for k, n in sorted(g.items(), key=lambda x: int(x[0])):
        for name, v in n['inputs'].items():
            if isinstance(v, list) and len(v) == 2 and g.get(str(v[0]), {}).get(
                    'class_type') == 'MpiSimpleBoolean':
                print('  #%s %s . %s  <- #%s' % (k, n['class_type'], name, v[0]))

    print('\n-- sampler arms --')
    for k, n in sorted(g.items(), key=lambda x: int(x[0])):
        if n['class_type'] in WATCH:
            lit = {a: b for a, b in n['inputs'].items() if not isinstance(b, list)}
            src = {a: '#%s' % b[0] for a, b in n['inputs'].items() if isinstance(b, list)}
            print('  #%-4s %-22s %s' % (k, n['class_type'], lit))
            if src:
                print('        from %s' % src)


if __name__ == '__main__':
    main(sys.argv[1])
