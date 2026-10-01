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
	cd "$(BASEDIR)/../containers" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o "$(BASEDIR)/../containers/main" main.go kubernetes.go

build: main
	docker build "$(BASEDIR)/../containers/." --tag=$(DOCKERREPO):admin
	docker push $(DOCKERREPO):admin

deploy:
	kubectl apply -f "$(BASEDIR)/admin.yaml"
	# zelfde tag (:admin) => apply ziet geen wijziging; restart forceert het pullen van de nieuwe image
	kubectl rollout restart deployment/admin-deployment

clean:
	-kubectl delete -f "$(BASEDIR)/admin.yaml"
