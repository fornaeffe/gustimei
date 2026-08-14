export default class CompletionReporter {
	#completed = new Map();
	#total = 0;
	#sent = false;

	printsToStdio() {
		return false;
	}

	onBegin(_config, suite) {
		this.#total = suite.allTests().length;
	}

	onTestEnd(test, result) {
		this.#completed.set(test.id, result.status);

		if (this.#sent || this.#completed.size !== this.#total) return;

		this.#sent = true;
		const passed = [...this.#completed.values()].every(
			(status) => status === 'passed' || status === 'skipped'
		);

		process.send?.({
			type: 'playwright-tests-complete',
			status: passed ? 'passed' : 'failed',
			total: this.#total
		});
	}
}
