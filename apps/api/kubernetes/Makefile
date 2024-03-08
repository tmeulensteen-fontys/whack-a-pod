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
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o "$(BASEDIR)/../containers/main" "$(BASEDIR)/../containers/main.go"

build: main
	docker build "$(BASEDIR)/../containers/." --tag=$(DOCKERREPO):api
	docker push $(DOCKERREPO):api

deploy: deployment service

deployment: 
#	kubectl create deployment api-deployment --replicas=12 --image=$(DOCKERREPO):api --port=8080 
#	kubectl label deployment api-deployment app=api --overwrite
	kubectl apply -f "$(BASEDIR)/api.yaml"

service:
	kubectl expose deployment api-deployment --target-port=8080  --type=NodePort --name=api --labels="app=api"

clean: clean.deployment clean.service 

clean.deployment: 
	-kubectl delete deployment api-deployment
	
clean.service: 
	-kubectl delete service api
