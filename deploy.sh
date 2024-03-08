#!/usr/bin/sh

DOCKERREPO="tommeulensteen/whack-a-pod" 
#DOCKERREPO = "zephinzer/eg-whack-a-pod"


kubectl create deployment admin-deployment --image="$DOCKERREPO":admin --replicas=1 --port=8080
kubectl expose deployment admin-deployment --name=admin --labels="app=admin"
#kubectl create serviceaccount wap-admin	
#kubectl create clusterrolebinding wap-admin --clusterrole=cluster-admin --serviceaccount=$$(kubectl config view -o jsonpath="{.contexts[?(@.name==\"$$(kubectl config current-context)\")].context.namespace}"):wap-admin
#kubectl set serviceaccount deployment admin-deployment wap-admin


kubectl create deployment api-deployment --image="$DOCKERREPO":api --port=8080 
kubectl expose deployment api-deployment --name=api --labels="app=api"

kubectl create deployment game-deployment --image="$DOCKERREPO":game  --port=8080
kubectl expose deployment game-deployment --name=game --labels="app=game"

kubectl create serviceaccount wap-admin
kubectl create clusterrolebinding wap-admin --clusterrole=cluster-admin --serviceaccount=default:wap-admin
kubectl set serviceaccount deployment admin-deployment wap-admin

kubectl apply -f apps/ingress/ingress.generic.yaml

# Install the nginx ingress controller
#kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml