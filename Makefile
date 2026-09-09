.PHONY: check package clean

check:
	python3 tests/static_check.py

package: check
	sh scripts/package.sh

clean:
	rm -rf dist

