#$dockerrepo = "tommeulensteen/whack-a-pod" 
$dockerrepo = "zephinzer/eg-whack-a-pod"


kubectl run admin-deployment --image="$dockerrepo":admin --replicas=1 --port=8080 --labels=app=admin --env="APIIMAGE="$dockerrepo":api"
kubectl expose deployment admin-deployment --name=admin --target-port=8080  --type=NodePort --labels="app=admin"
#kubectl create serviceaccount wap-admin	
#kubectl create clusterrolebinding wap-admin --clusterrole=cluster-admin --serviceaccount=$$(kubectl config view -o jsonpath="{.contexts[?(@.name==\"$$(kubectl config current-context)\")].context.namespace}"):wap-admin
#kubectl set serviceaccount deployment admin-deployment wap-admin


kubectl run api-deployment --image="$dockerrepo":api --replicas=12 --port=8080 --labels=app=api 
kubectl expose deployment api-deployment --name=api --target-port=8080  --type=NodePort --labels="app=api"

kubectl run game-deployment --image="$dockerrepo":game --replicas=4 --port=8080 --labels=app=game 
kubectl expose deployment game-deployment --name=game --target-port=8080  --type=NodePort --labels="app=game"


