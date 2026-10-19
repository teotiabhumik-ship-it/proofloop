.PHONY: test run

test:
	npm test -- --test-reporter=spec

run:
	node server.js
