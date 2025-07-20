node("base-sbt")
{
    def slackImageName = "${env.HARBOR_HOST}/rnd-devops/images/mcp-slack"
    def routerImageName = "${env.HARBOR_HOST}/rnd-devops/images/mcp-router"
    def registryImageName = "${env.HARBOR_HOST}/rnd-devops/images/mcp-registry"
    def inspectorImageName = "${env.HARBOR_HOST}/rnd-devops/images/mcp-inspector"

    stage("Build and Push Slack"){ 
        println "Building Slack image ${slackImageName}... "
        dockerImage = docker.build slackImageName, "-f mcp-clients/slack/Dockerfile ."
        withDockerRegistry(credentialsId: 'harbor-robot', url: env.HARBOR_REGISTRY)
        {
           dockerImage.push("$BUILD_NUMBER")
        }
    }

    stage("Build and Push Router"){ 
        println "Building Router image ${routerImageName}... "
        dockerImage = docker.build routerImageName, "-f mcps/router/Dockerfile ."
        withDockerRegistry(credentialsId: 'harbor-robot', url: env.HARBOR_REGISTRY)
        {
           dockerImage.push("$BUILD_NUMBER")
        }
    }

    stage("Build and Push Registry"){ 
        println "Building Registry image ${registryImageName}... "
        dockerImage = docker.build registryImageName, "-f mcps/registry/Dockerfile ."
        withDockerRegistry(credentialsId: 'harbor-robot', url: env.HARBOR_REGISTRY)
        {
           dockerImage.push("$BUILD_NUMBER")
        }
    }

    stage("Build and Push Inspector"){ 
        println "Building Inspector image ${inspectorImageName}... "
        dockerImage = docker.build inspectorImageName, "-f mcps/inspector/Dockerfile ."
        withDockerRegistry(credentialsId: 'harbor-robot', url: env.HARBOR_REGISTRY)
        {
           dockerImage.push("$BUILD_NUMBER")
        }
    }

    stage("Deploy to Kubernetes") {
        sleep 30 // wait for the images to be indexed in Harbor
        
        // Apply namespace and config
        sh "kubectl apply -f k8s/namespace.yaml"
        sh "kubectl apply -f k8s/configmap.yaml"
        
        // Deploy all services
        sh "kubectl apply -f k8s/slack-deployment.yaml"
        sh "kubectl apply -f k8s/router-deployment.yaml"
        sh "kubectl apply -f k8s/registry-deployment.yaml"
        sh "kubectl apply -f k8s/inspector-deployment.yaml"
        sh "kubectl apply -f k8s/ingress.yaml"
        
        // Update image tags for rolling updates
        sh "kubectl -n mcp-gate set image deployment/mcp-slack-app mcp-slack-app=${slackImageName}:${BUILD_NUMBER}"
        sh "kubectl -n mcp-gate set image deployment/mcp-router-app mcp-router-app=${routerImageName}:${BUILD_NUMBER}"
        sh "kubectl -n mcp-gate set image deployment/mcp-registry-app mcp-registry-app=${registryImageName}:${BUILD_NUMBER}"
        sh "kubectl -n mcp-gate set image deployment/mcp-inspector-app mcp-inspector-app=${inspectorImageName}:${BUILD_NUMBER}"
        
        // Wait for deployments to be ready
        sh "kubectl -n mcp-gate rollout status deployment/mcp-slack-app --timeout=300s"
        sh "kubectl -n mcp-gate rollout status deployment/mcp-router-app --timeout=300s"
        sh "kubectl -n mcp-gate rollout status deployment/mcp-registry-app --timeout=300s"
        sh "kubectl -n mcp-gate rollout status deployment/mcp-inspector-app --timeout=300s"
    }
}