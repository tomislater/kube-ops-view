import Node from './node.js'
import { Pod } from './pod.js'
import App from './app.js'
const PIXI = require('pixi.js')

export default class Cluster extends PIXI.Graphics {
    constructor (cluster, status, tooltip) {
        super()
        this.cluster = cluster
        this.status = status
        this.tooltip = tooltip
    }

    destroy() {
        if (this.tick) {
            PIXI.ticker.shared.remove(this.tick, this)
        }
        super.destroy()
    }

    pulsate(_time) {
        const v = Math.sin((PIXI.ticker.shared.lastTime % 1000) / 1000. * Math.PI)
        this.alpha = 0.4 + (v * 0.6)
    }

    draw () {
        this.removeChildren()
        this.clear()
        const left = 10
        const top = 20
        const padding = 5
        let masterX = left
        let masterY = top
        let masterWidth = 0
        let masterHeight = 0
        let workerX = left
        let workerY = top
        let workerWidth = 0
        let workerHeight = 0
        const workerNodes = []
        const maxWidth = window.innerWidth - 130
        let nodesPerRow = Infinity
        for (const nodeName of Object.keys(this.cluster.nodes).sort()) {
            const node = this.cluster.nodes[nodeName]
            var nodeBox = new Node(node, this, this.tooltip)
            nodeBox.draw()
            if (nodeBox.isMaster()) {
                if (masterX > maxWidth) {
                    masterWidth = masterX
                    masterX = left
                    masterY += nodeBox.height + padding
                    masterHeight += nodeBox.height + padding
                }
                // there might be case when second master is larger, so we should
                // compute this for every master and keep the max
                const tempMasterHeight = nodeBox.height + padding
                if (tempMasterHeight >= masterHeight) {
                    masterHeight = tempMasterHeight
                }
                nodeBox.x = masterX
                nodeBox.y = masterY
                masterX += nodeBox.width + padding
            } else {
                if (workerX > maxWidth) {
                    nodesPerRow = Math.floor(workerX / (nodeBox.width + padding))
                    // get node from above, with this
                    const nodeBoxAbove = workerNodes[workerNodes.length % nodesPerRow]
                    workerWidth = workerX
                    workerX = left
                    workerY += nodeBoxAbove.height + padding
                    workerHeight += nodeBoxAbove.height + padding
                }

                // it is used for drawing a cluster (height)
                const tempWorkerHeight = nodeBox.height + padding
                if (tempWorkerHeight >= workerHeight) {
                    workerHeight = tempWorkerHeight
                }
                nodeBox.x = workerX
                
                if (workerNodes.length > nodesPerRow) {
                    const nodeBoxAbove = workerNodes[workerNodes.length % nodesPerRow]
                    nodeBox.y = nodeBoxAbove.height + padding + top
                } else {
                    nodeBox.y = workerY
                }

                workerX += nodeBox.width + padding

                workerNodes.push(nodeBox)
            }
            this.addChild(nodeBox)
        }
        for (const nodeBox of workerNodes) {
            nodeBox.y += masterHeight
        }


        for (const pod of Object.values(this.cluster.unassigned_pods)) {
            var podBox = Pod.getOrCreate(pod, this, this.tooltip)
            podBox.x = masterX
            podBox.y = masterY
            podBox.draw()
            this.addChild(podBox)
            masterX += 20
        }
        masterWidth = Math.max(masterX, masterWidth)
        workerWidth = Math.max(workerX, workerWidth)

        this.lineStyle(2, App.current.theme.primaryColor, 1)
        const width = Math.max(masterWidth, workerWidth)
        this.drawRect(0, 0, width, top + masterHeight + workerHeight)

        const topHandle = this.topHandle = new PIXI.Graphics()
        topHandle.beginFill(App.current.theme.primaryColor, 1)
        topHandle.drawRect(0, 0, width, 15)
        topHandle.endFill()
        topHandle.interactive = true
        topHandle.buttonMode = true
        const that = this
        topHandle.on('click', function(_event) {
            App.current.toggleCluster(that.cluster.id)
        })
        const text = new PIXI.Text(this.cluster.api_server_url, {fontFamily: 'ShareTechMono', fontSize: 10, fill: 0x000000})
        text.x = 2
        text.y = 2
        topHandle.addChild(text)
        this.addChild(topHandle)

        let newTick = null
        const nowSeconds = Date.now() / 1000
        if (this.status && this.status.last_query_time < nowSeconds - 20) {
            newTick = this.pulsate
        }

        if (newTick && newTick != this.tick) {
            this.tick = newTick
            // important: only register new listener if it does not exist yet!
            // (otherwise we leak listeners)
            PIXI.ticker.shared.add(this.tick, this)
        } else if (!newTick && this.tick) {
            PIXI.ticker.shared.remove(this.tick, this)
            this.tick = null
            this.alpha = 1
            this.tint = 0xffffff
        }
    }

}
