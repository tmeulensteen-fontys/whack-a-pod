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
	docker build "$(BASEDIR)/../containers/." --tag=$(DOCKERREPO):api
	docker push $(DOCKERREPO):api

deploy: deployment service

deployment:
	kubectl create deployment game-deployment --image="$(DOCKERREPO)":game  --port=8080

service:
	kubectl expose deployment game-deployment --name=game --labels="app=game"

clean: clean.deployment clean.service 

clean.deployment: 
	-kubectl delete deployment api-deployment
	
clean.service: 
	-kubectl delete service api