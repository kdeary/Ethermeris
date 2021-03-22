const _ = require('lodash');
const detailedDiff = require('deep-object-diff').detailedDiff;
const Utils = {};

Utils.mergeModifier = (objValue, srcValue, key, object, source, stack) => {
	if(_.isArray(srcValue)){
		return srcValue;
	}

	let objectKeys = Object.keys(srcValue);
	if(objectKeys.length > 0) {
		let newObject = {...objValue, ...srcValue};
		objectKeys.forEach(key => {
			if(newObject[key] === null) delete newObject[key];
		});

		return newObject;
	}
};

Utils.compressNetworkEvent = (event, data) => {
	return [event, data];
};

Utils.decompressNetworkEvent = data => {
	return {
		name: data[0],
		data: data[1]
	};
};

Utils.makeID = (length=5) => {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	for (let i = 0; i < length; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}

Utils.fullDiff = (obj1, obj2) => {
	let splitDiff = detailedDiff(obj1, obj2);
	return _.merge({}, splitDiff.added, splitDiff.deleted, splitDiff.updated);
}

module.exports = Utils;