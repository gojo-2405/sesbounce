pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build, Push & Scan') {
            steps {
                // build.sh builds, pushes to ECR, then waits for the ECR scan
                // and exits 1 if CRITICAL/HIGH vulnerabilities are found.
                // A non-zero exit here fails this stage and Jenkins will not
                // proceed to the Deploy stage below.
                sh 'chmod +x /scripts/build.sh && /scripts/build.sh'
            }
        }

        stage('Deploy') {
            steps {
                sh 'chmod +x /scripts/deploy.sh && /scripts/deploy.sh'
            }
        }
    }

    post {
        failure {
            echo "Pipeline failed - check the Build, Push & Scan stage logs for vulnerability findings."
        }
    }
}
