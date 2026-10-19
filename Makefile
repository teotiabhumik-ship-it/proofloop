.PHONY: test run

test:
	npm test -- --test-reporter=spec

run:
	python3 -m http.server 4173 --bind 0.0.0.0
