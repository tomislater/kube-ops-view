.PHONY: clean test appjs docker push mock

IMAGE            ?= kube-ops-view
VERSION          ?= $(shell git describe --tags --always --dirty)
TAG              ?= $(VERSION)
TTYFLAGS         = $(shell test -t 0 && echo "-it")

default: docker

clean:
	rm -fr kube_ops_view/static/build

test:
	pipenv run flake8
	pipenv run coverage run --source=kube_ops_view -m py.test
	pipenv run coverage report

appjs:
	docker run --rm $(TTYFLAGS) -u $$(id -u) -v $$(pwd):/workdir -w /workdir/app -e NPM_CONFIG_CACHE=/tmp node:11.4-alpine npm install
	docker run --rm $(TTYFLAGS) -u $$(id -u) -v $$(pwd):/workdir -w /workdir/app -e NPM_CONFIG_CACHE=/tmp node:11.4-alpine npm run build

docker: appjs
	docker build --build-arg "VERSION=$(VERSION)" -t "$(IMAGE)" .
	@echo 'Docker image $(IMAGE) can now be used.'

push: docker
	docker push "$(IMAGE):$(TAG)"

mock:
	docker run $(TTYFLAGS) -p 8080:8080 "$(IMAGE):$(TAG)" --mock

develop:
	docker run -it --rm $(TTYFLAGS) -e CLUSTERS=http://docker.for.mac.localhost:8001 -p 8080:8080 "$(IMAGE)"

develop-mock:
	docker run -it --rm $(TTYFLAGS) -v $$(pwd)/kube_ops_view:/kube_ops_view -p 8080:8080 "$(IMAGE)" --mock --debug

# before this run "npm start" in app folder
development:
	docker run -it --rm $(TTYFLAGS) -v $$(pwd)/kube_ops_view:/kube_ops_view -e CLUSTERS=http://docker.for.mac.localhost:8001 -p 8080:8080 "$(IMAGE)" --debug