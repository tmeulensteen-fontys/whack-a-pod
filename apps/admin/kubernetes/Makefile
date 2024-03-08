# Copyright 2017 Google Inc. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
BASEDIR = $(shell pwd)

include ../../../Makefile.properties

app: build deploy

main:
	go get github.com/gorilla/mux
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o "$(BASEDIR)/../containers/main" "$(BASEDIR)/../containers/main.go" "$(BASEDIR)/../containers/kubernetes.go"	

build: main
	docker build "$(BASEDIR)/../containers/." --tag=$(DOCKERREPO):admin
	docker push $(DOCKERREPO):admin

deploy: deployment service serviceaccount

deployment:  
#	kubectl create deployment admin-deployment --image=$(DOCKERREPO):admin --port=8080
#	kubectl set env deployment admin-deployment APIIMAGE=$(DOCKERREPO):api
#	kubectl label deployment admin-deployment app=admin --overwrite
	kubectl apply -f "$(BASEDIR)/admin.yaml"

service:
	kubectl expose deployment admin-deployment --target-port=8080  --type=NodePort --name=admin --labels="app=admin"

serviceaccount:
	kubectl create serviceaccount wap-admin	
	kubectl create clusterrolebinding wap-admin --clusterrole=cluster-admin --serviceaccount=default:wap-admin
	kubectl set serviceaccount deployment admin-deployment wap-admin

clean: clean.deployment clean.service clean.serviceaccount

clean.deployment: 
	-kubectl delete deployment admin-deployment

clean.serviceaccount:
	-kubectl delete serviceaccount wap-admin
	-kubectl delete clusterrolebinding wap-admin 
	
clean.service: 
	-kubectl delete service admin

