import {Pod} from './pod.js'
import Bars from './bars.js'
import {parseResource} from './utils.js'
import App from './app'
const PIXI = require('pixi.js')

export default class Node extends PIXI.Graphics {
    constructor(node, cluster, tooltip, podsPerRow) {
        super()
        this.node = node
        this.cluster = cluster
        this.tooltip = tooltip
        this.sizeOfPod = 13
        this.podsPerRow = podsPerRow
    }

    isMaster() {
        for (var key in this.node.labels) {
            if (key == 'node-role.kubernetes.io/master' ||
                key == 'kubernetes.io/role' && this.node.labels[key] == 'master' ||
                key == 'master' && this.node.labels[key] == 'true' ) {
                return true
            }
        }
    }

    getResourceUsage() {
        const resources = {}
        for (const key of Object.keys(this.node.status.capacity)) {
            resources[key] = {
                'capacity': parseResource(this.node.status.capacity[key]),
                'reserved': 0,
                'requested': 0,
                'used': 0
            }
            const allocatable = this.node.status.allocatable[key]
            if (allocatable) {
                resources[key]['reserved'] = resources[key]['capacity'] - parseResource(allocatable)
            }
        }
        if (this.node.usage) {
            for (const key of Object.keys(this.node.usage)) {
                resources[key]['used'] = parseResource(this.node.usage[key])
            }
        }
        let numberOfPods = 0
        for (const pod of Object.values(this.node.pods)) {
            numberOfPods++
            // do not account for completed jobs
            if (pod.phase != 'Succeeded') {
                for (const container of pod.containers) {
                    if (container.resources && container.resources.requests) {
                        for (const key of Object.keys(container.resources.requests)) {
                            resources[key].requested += parseResource(container.resources.requests[key])
                        }
                    }
                }
            }
        }
        resources['pods'].requested = numberOfPods
        resources['pods'].used = numberOfPods
        return resources
    }

    draw() {
        const nodeBox = this
        const topHandle = new PIXI.Graphics()
        const heightOfTopHandle = 15
        // let's find width
        // (width - 24) / numberOfPods = 13.5
        const width = Math.max(105, Math.floor(nodeBox.podsPerRow * nodeBox.sizeOfPod + 24 + 2))
        const height = Math.max(115, Math.floor(
            nodeBox.podsPerRow * nodeBox.sizeOfPod + heightOfTopHandle + (nodeBox.sizeOfPod * 2) + 2
        ))
        topHandle.beginFill(App.current.theme.primaryColor, 1)
        topHandle.drawRect(0, 0, width, heightOfTopHandle)
        topHandle.endFill()
        const ellipsizedNodeName = this.node.name.length > 17 ? this.node.name.substring(0, 17).concat('…') : this.node.name
        const text = new PIXI.Text(ellipsizedNodeName, {fontFamily: 'ShareTechMono', fontSize: 10, fill: 0x000000})
        text.x = 2
        text.y = 2
        topHandle.addChild(text)
        nodeBox.addChild(topHandle)

        // add nodeBox.sizeOfPod, becuase we want to draw the bottom of node under the pods (create an invisible row of pods)
        // add 2, becuase we want to have a span between pods and the node
        nodeBox.addPods(App.current.sorterFn, height)

        nodeBox.lineStyle(2, App.current.theme.primaryColor, 1)
        nodeBox.beginFill(App.current.theme.secondaryColor, 1)
        // let's find height
        nodeBox.drawRect(0, 0, width, height)
        nodeBox.endFill()
        nodeBox.lineStyle(2, 0xaaaaaa, 1)
        topHandle.interactive = true
        topHandle.on('mouseover', function () {
            let s = nodeBox.node.name
            s += '\nLabels:'
            for (const key of Object.keys(nodeBox.node.labels).sort()) {
                s += '\n  ' + key + ': ' + nodeBox.node.labels[key]
            }
            nodeBox.tooltip.setText(s)
            nodeBox.tooltip.position = nodeBox.toGlobal(new PIXI.Point(0, heightOfTopHandle))
            nodeBox.tooltip.visible = true
        })
        topHandle.on('mouseout', function () {
            nodeBox.tooltip.visible = false
        })
        const resources = this.getResourceUsage()
        const bars = new Bars(nodeBox, resources, nodeBox.tooltip)
        bars.x = 0
        bars.y = 1
        nodeBox.addChild(bars.draw(height))

        return nodeBox
    }

    addPods(sorterFn, height) {
        const nodeBox = this
        const px = 24
        const py = 20
        let podsCounter = 0
        const pods = Object.values(this.node.pods).sort(sorterFn)
        for (const pod of pods) {
            if (pod.namespace != 'kube-system') {
                const podBox = Pod.getOrCreate(pod, this.cluster, this.tooltip)
                podBox.movePodTo(
                    new PIXI.Point(
                        // we have a room for six pods
                        px + (nodeBox.sizeOfPod * (podsCounter % nodeBox.podsPerRow)),
                        // there is no restrictions in height of the node, so just count when we have to get to another row
                        py + (nodeBox.sizeOfPod * Math.floor(podsCounter / nodeBox.podsPerRow))
                    )
                )
                nodeBox.addChild(podBox.draw())

                podsCounter++
            }
        }

        podsCounter = 0
        
        for (const pod of pods) {
            if (pod.namespace == 'kube-system') {
                const podBox = Pod.getOrCreate(pod, this.cluster, this.tooltip)
                podBox.movePodTo(
                    new PIXI.Point(
                        px + (nodeBox.sizeOfPod * (podsCounter % nodeBox.podsPerRow)),
                        height - nodeBox.sizeOfPod - 2 - (nodeBox.sizeOfPod * Math.floor(podsCounter / nodeBox.podsPerRow))
                    )
                )
                nodeBox.addChild(podBox.draw())
                podsCounter++
            }
        }
    }
}
