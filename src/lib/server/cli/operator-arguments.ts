const argumentSyntaxError = 'Every operator argument must use name=value or --name value syntax';

export function parseOperatorArguments(rawArguments: string[]) {
	const argumentsByName = new Map<string, string>();

	for (let index = 0; index < rawArguments.length;) {
		const argument = rawArguments[index];
		if (!argument) throw new Error(argumentSyntaxError);

		if (argument.startsWith('--')) {
			const equalsIndex = argument.indexOf('=');
			if (equalsIndex > 2) {
				setArgument(
					argumentsByName,
					argument.slice(2, equalsIndex),
					argument.slice(equalsIndex + 1)
				);
				index += 1;
				continue;
			}

			const value = rawArguments[index + 1];
			if (!value || value.startsWith('--')) throw new Error(argumentSyntaxError);
			setArgument(argumentsByName, argument.slice(2), value);
			index += 2;
			continue;
		}

		const equalsIndex = argument.indexOf('=');
		if (equalsIndex <= 0) throw new Error(argumentSyntaxError);
		setArgument(argumentsByName, argument.slice(0, equalsIndex), argument.slice(equalsIndex + 1));
		index += 1;
	}

	return argumentsByName;
}

function setArgument(argumentsByName: Map<string, string>, name: string, value: string) {
	if (!name || !value || name.startsWith('-')) throw new Error(argumentSyntaxError);
	argumentsByName.set(name, value);
}
