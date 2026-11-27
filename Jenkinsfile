pipeline {

    agent any

    environment {
        DOCKER_CREDS_ID = 'dockerhub-creds'
        DOCKER_REGISTRY = 'docker.io'

        DOCKER_IMAGE_NAME = 'vilasvarghese/enterprise-demo-app'

        IMAGE_TAG = "v1.0.${BUILD_NUMBER}"

        FULL_IMAGE = "${DOCKER_IMAGE_NAME}:${IMAGE_TAG}"

        PROD_SERVER_IP = '172.31.18.247'

        PROD_USER = 'deploy_user'
    }

    options {

        buildDiscarder(logRotator(numToKeepStr: '10'))

        timeout(time: 30, unit: 'MINUTES')

        disableConcurrentBuilds()

        skipDefaultCheckout(true)
    }

    stages {

        stage('Checkout Source Code') {

            steps {

                echo 'Checking out code from GitHub...'

                checkout scm
            }
        }

        stage('Install Dependencies & Unit Test') {

            steps {

                echo 'Installing npm packages and executing Jest tests...'

                sh '''
                    set -e

                    if [ ! -f package-lock.json ]; then
                        npm install --package-lock-only
                    fi

                    npm ci

                    npm test
                '''
            }
        }

        stage('Static Code Analysis (SonarQube)') {

            environment {

                scannerHome = tool 'SonarQubeScanner'
            }

            steps {

                echo 'Running SonarQube analysis...'

                withSonarQubeEnv('SonarQube-Enterprise') {

                    sh "${scannerHome}/bin/sonar-scanner"
                }
            }
        }

        stage('Quality Gate') {

            steps {

                echo 'Waiting for SonarQube Quality Gate status...'

                timeout(time: 5, unit: 'MINUTES') {

                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build Docker Image') {

            steps {

                echo "Building Docker Image: ${FULL_IMAGE}"

                sh '''
                    docker build -t "$FULL_IMAGE" .
                '''
            }
        }

        stage('Container Vulnerability Scan (Trivy)') {

            steps {

                echo "Scanning ${FULL_IMAGE} for HIGH and CRITICAL vulnerabilities..."

                sh '''
                    trivy image \
                        --severity HIGH,CRITICAL \
                        --exit-code 0 \
                        --no-progress \
                        "$FULL_IMAGE"
                '''
            }
        }

        stage('Push to Remote Registry') {

            steps {

                echo 'Pushing image to DockerHub...'

                withCredentials([
                    usernamePassword(
                        credentialsId: DOCKER_CREDS_ID,
                        passwordVariable: 'DOCKER_PASS',
                        usernameVariable: 'DOCKER_USER'
                    )
                ]) {

                    sh '''
                        set -eu
                        set +x

                        export DOCKER_CONFIG=$(mktemp -d)

                        trap 'docker logout >/dev/null 2>&1 || true; rm -rf "$DOCKER_CONFIG"' EXIT

                        printf '%s' "$DOCKER_PASS" | docker login \
                            -u "$DOCKER_USER" \
                            --password-stdin

                        docker push "$FULL_IMAGE"

                        docker tag "$FULL_IMAGE" "$DOCKER_IMAGE_NAME:latest"

                        docker push "$DOCKER_IMAGE_NAME:latest"
                    '''
                }
            }
        }

        stage('Deploy to Production EC2') {

            steps {

                echo 'Initiating remote deployment to Kubernetes Server...'

                sshagent(credentials: ['prod-ssh-key']) {

                    sh '''
                        set -eu

                        ssh -o StrictHostKeyChecking=yes \
                            -o BatchMode=yes \
                            -o ConnectTimeout=10 \
                            "$PROD_USER@$PROD_SERVER_IP" \
                            bash -s -- "$FULL_IMAGE" <<'EOF'

set -euo pipefail

echo "Connected to Kubernetes server"

hostname

whoami

export FINAL_IMAGE="$1"

echo "Deploying image: $FINAL_IMAGE"

kubectl create deployment mycicd \
    --image="$FINAL_IMAGE" \
    --replicas=2 \
    --dry-run=client \
    -o yaml | kubectl apply -f -

kubectl create service clusterip mycicd \
    --tcp=80:3000 \
    --dry-run=client \
    -o yaml | kubectl apply -f -

echo "Waiting for deployment rollout..."

kubectl rollout status deployment/mycicd \
    --timeout=180s

echo "Deployment status:"

kubectl get deployment mycicd

echo "Pod status:"

kubectl get pods -l app=mycicd

echo "Service status:"

kubectl get svc mycicd

EOF
                    '''
                }
            }
        }

        stage('Production Health Check') {

            steps {

                echo 'Verifying application health on Kubernetes...'

                timeout(time: 2, unit: 'MINUTES') {

                    sshagent(credentials: ['prod-ssh-key']) {

                        sh '''
                            set -eu

                            ssh -o StrictHostKeyChecking=yes \
                                -o BatchMode=yes \
                                -o ConnectTimeout=10 \
                                "$PROD_USER@$PROD_SERVER_IP" \
                                bash -s <<'EOF'

set -euo pipefail

SERVICE_IP=$(kubectl get svc mycicd \
    -o jsonpath='{.spec.clusterIP}')

echo "ClusterIP: $SERVICE_IP"

echo "Checking application health..."

curl -fsS \
    --retry 5 \
    --retry-connrefused \
    --retry-delay 3 \
    --connect-timeout 5 \
    --max-time 10 \
    "http://${SERVICE_IP}/health"

echo ""

echo "Application health check successful!"

EOF
                        '''
                    }
                }
            }
        }

    } // End of stages block - THIS WAS MISSING

    post {

        always {

            echo 'Cleaning up local Docker image...'

            sh '''
                if docker image inspect "$FULL_IMAGE" >/dev/null 2>&1; then
                    docker rmi "$FULL_IMAGE" || true
                fi
            '''

            echo 'Cleaning up local workspace...'

            cleanWs()
        }

        success {

            echo 'Deployment Successful!'

            // slackSend(
            //     color: 'good',
            //     message: "SUCCESS: ${env.JOB_NAME} [${env.BUILD_NUMBER}] deployed successfully. Image: ${FULL_IMAGE}"
            // )
        }

        failure {

            echo 'Pipeline Failed!'

            // slackSend(
            //     color: 'danger',
            //     message: "FAILED: ${env.JOB_NAME} [${env.BUILD_NUMBER}] has failed."
            // )
        }

        unstable {

            echo 'Pipeline completed with warnings!'
        }
    }

} // End of pipeline block
