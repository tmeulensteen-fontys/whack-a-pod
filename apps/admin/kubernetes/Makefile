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

build: main
	docker build "$(BASEDIR)/../containers/." --tag=$(DOCKERREPO):admin
	docker push $(DOCKERREPO)/whackapod-admin

deploy: deployment service

deployment:  
	kubectl create deployment admin-deployment --image=$(DOCKERREPO):admin --port=8080 --env="APIIMAGE=$(DOCKERREPO):api"
	kubectl expose deployment admin-deployment --name=admin --labels="app=admin"
	kubectl create serviceaccount wap-admin	
	kubectl create clusterrolebinding wap-admin --clusterrole=cluster-admin --serviceaccount=default:wap-admin
	kubectl set serviceaccount deployment admin-deployment wap-admin

service:
	kubectl expose deployment admin-deployment --name=admin --labels="app=admin"

clean: clean.deployment clean.service 

clean.deployment: 
	-kubectl delete deployment admin-deployment
	-kubectl delete serviceaccount wap-admin
	-kubectl delete clusterrolebinding wap-admin 
	
clean.service: 
	-kubectl delete service admin

