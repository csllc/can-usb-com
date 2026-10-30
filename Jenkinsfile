pipeline {
    agent any
    environment {
            HOME = '.'
    }
    stages {

        stage('Test Node 20') {
            agent {
                docker {
                    image 'node:20-slim'
                }
            }
            steps {
                sh 'rm -rf node_modules'
                sh 'npm install && npm test'
            }
        }
        stage('Test Node 22') {
            agent {
                docker {
                    image 'node:22-slim'
                }
            }
            steps {
                sh 'rm -rf node_modules'
                sh 'npm install && npm test'
            }
        }
        stage('Test Node 24') {
            agent {
                docker {
                    image 'node:24-slim'
                }
            }
            steps {
                sh 'rm -rf node_modules'
                sh 'npm install && npm test'
            }
        }

    }
    post {
            // Clean after build
            always {
                cleanWs disableDeferredWipeout: true, deleteDirs: true
            }
        }
}