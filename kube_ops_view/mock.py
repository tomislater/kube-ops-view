import random
import time

names = [
    'agentCooper',
    'blackLodge',
    'bob',
    'bobbyBriggs',
    'lauraPalmer',
    'lelandPalmer',
    'logLady',
    'sheriffTruman',
]


def hash_int(x: int):
    x = ((x >> 16) ^ x) * 0x45d9f3b
    x = ((x >> 16) ^ x) * 0x45d9f3b
    x = (x >> 16) ^ x
    return x


def generate_mock_pod(index: int, i: int, j: int):
    pod_phases = ['Pending', 'Running', 'Running']
    labels = {}
    phase = pod_phases[hash_int((index + 1) * (i + 1) * (j + 1)) % len(pod_phases)]
    containers = []
    for k in range(1 + j % 2):
        container = {
            'name': 'myapp', 'image': 'foo/bar/{}'.format(j),
            'resources': {'requests': {'cpu': '100m', 'memory': '100Mi'}, 'limits': {}},
            'ready': True,
            'state': {'running': {}}
        }
        if phase == 'Running':
            if j % 13 == 0:
                container.update(**{'ready': False, 'state': {'waiting': {'reason': 'CrashLoopBackOff'}}})
            elif j % 7 == 0:
                container.update(**{'ready': True, 'state': {'running': {}}, 'restartCount': 3})
        containers.append(container)
    pod = {
        'name': '{}-{}-{}'.format(names[hash_int((i + 1) * (j + 1)) % len(names)], i, j),
        'namespace': 'kube-system' if j < 3 else 'default',
        'labels': labels,
        'phase': phase,
        'containers': containers
    }
    if phase == 'Running' and j % 17 == 0:
        pod['deleted'] = 123

    return pod


def generate_mock_services(pods, nodes):
    services = []
    for name in names:
        ports = random.choices(['8080', '443', '5443', '8888', '7979', '9000', '8000'])
        service = {
            'name': name,
            'namespace': 'default',
            'clusterIP': '127.0.0.1',
            'ports': ports,
            'selector': {
                'app': name
            },
            'type': 'Loadbalancer'
        }
        endpoint = {
            # is this universally applicable?
            'name': name,
            'namespace': service['namespace'],
            'subsets': []
        }
        subset = {
            'addresses': [],
            'ports': ports
        }

        selected_pods = pods.get(name, [])
        for pod in selected_pods:
            address_item = {
                'ip': pod.get('ip', ''),
                'nodeName': random.choice(nodes),
                'kind': 'Pod',
                'namespace': pod['namespace'],
                'name': pod['name']
            }
            subset['addresses'].append(address_item)
        endpoint['subsets'].append(subset)
        service['endpoint'] = endpoint
        services.append(service)
    return services


def query_mock_cluster(cluster):
    '''Generate deterministic (no randomness!) mock data'''
    index = int(cluster.id.split('-')[-1])
    nodes = {}
    pods_by_cluster = {}

    for i in range(10):
        # add/remove the second to last node every 13 seconds
        if i == 8 and int(time.time() / 13) % 2 == 0:
            continue
        labels = {}
        if i < 2:
            labels['master'] = 'true'
        pods = {}
        for j in range(hash_int((index + 1) * (i + 1)) % 32):
            # add/remove some pods every 7 seconds
            if j % 17 == 0 and int(time.time() / 7) % 2 == 0:
                pass
            else:
                pod = generate_mock_pod(index, i, j)
                pods['{}/{}'.format(pod['namespace'], pod['name'])] = pod
                # storing them under the pods' original name for easy service/endpoint mocking
                pod_name = pod['name'].split('-')[0]
                pod_list = pods_by_cluster.get(pod_name, [])
                pod_list.append(pod)
                pods_by_cluster[pod_name] = pod_list

        node = {'name': 'node-{}'.format(i), 'labels': labels,
                'status': {'capacity': {'cpu': '4', 'memory': '32Gi', 'pods': '110'}}, 'pods': pods}
        nodes[node['name']] = node
    pod = generate_mock_pod(index, 11, index)
    unassigned_pods = {'{}/{}'.format(pod['namespace'], pod['name']): pod}
    services = generate_mock_services(pods_by_cluster, [key for key, _ in nodes.items()])
    return {
        'id': 'mock-cluster-{}'.format(index),
        'api_server_url': 'https://kube-{}.example.org'.format(index),
        'nodes': nodes,
        'unassigned_pods': unassigned_pods,
        'services': services
    }
