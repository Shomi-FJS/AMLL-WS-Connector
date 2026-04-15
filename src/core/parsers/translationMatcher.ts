interface MatchTextsByTimeOptions<TSource> {
	getText: (source: TSource) => string;
	getTimeVariants: (source: TSource) => readonly number[];
	strictToleranceMs?: number;
	looseToleranceMs?: number;
	fallbackToleranceMs?: number;
	/**
	 * 当 source 行数明显少于 target（比如逐字歌词拆行）时，允许复用 source。
	 * 否则会出现“填满 source 后剩余 target 永远为空”的情况。
	 */
	allowReuseSources?: boolean;
}

interface TimeCandidate {
	sourceIndex: number;
	timeMs: number;
}

interface NearestSourceMatch {
	sourceIndex: number;
	diff: number;
}

function lowerBound(
	candidates: readonly TimeCandidate[],
	targetMs: number,
): number {
	let left = 0;
	let right = candidates.length;

	while (left < right) {
		const middle = Math.floor((left + right) / 2);
		if (candidates[middle].timeMs < targetMs) {
			left = middle + 1;
		} else {
			right = middle;
		}
	}

	return left;
}

function buildTimeCandidates<TSource>(
	sources: readonly TSource[],
	getTimeVariants: (source: TSource) => readonly number[],
): TimeCandidate[] {
	const candidates: TimeCandidate[] = [];

	for (let i = 0; i < sources.length; i++) {
		const source = sources[i];
		const seenTimes = new Set<number>();
		for (const timeMs of getTimeVariants(source)) {
			if (!Number.isFinite(timeMs) || seenTimes.has(timeMs)) continue;
			seenTimes.add(timeMs);
			candidates.push({ sourceIndex: i, timeMs });
		}
	}

	candidates.sort((a, b) => a.timeMs - b.timeMs);
	return candidates;
}

function findNearestSourceMatch(
	candidates: readonly TimeCandidate[],
	targetMs: number,
): NearestSourceMatch {
	if (candidates.length === 0) {
		return { sourceIndex: -1, diff: Infinity };
	}

	const insertAt = lowerBound(candidates, targetMs);
	let bestSourceIndex = -1;
	let bestDiff = Infinity;

	const consider = (candidateIndex: number) => {
		if (candidateIndex < 0 || candidateIndex >= candidates.length) return;
		const candidate = candidates[candidateIndex];
		const diff = Math.abs(candidate.timeMs - targetMs);
		if (diff < bestDiff) {
			bestDiff = diff;
			bestSourceIndex = candidate.sourceIndex;
		}
	};

	consider(insertAt - 1);
	consider(insertAt);

	return { sourceIndex: bestSourceIndex, diff: bestDiff };
}

function findBestAvailableSourceIndex(
	candidates: readonly TimeCandidate[],
	targetMs: number,
	usedSourceIndices: ReadonlySet<number>,
	toleranceMs: number,
): number {
	if (candidates.length === 0) return -1;

	const insertAt = lowerBound(candidates, targetMs);
	let left = insertAt - 1;
	let right = insertAt;
	let bestSourceIndex = -1;
	let bestDiff = Infinity;

	const consider = (candidateIndex: number) => {
		if (candidateIndex < 0 || candidateIndex >= candidates.length) return;
		const candidate = candidates[candidateIndex];
		if (usedSourceIndices.has(candidate.sourceIndex)) return;

		const diff = Math.abs(candidate.timeMs - targetMs);
		if (diff < bestDiff) {
			bestDiff = diff;
			bestSourceIndex = candidate.sourceIndex;
		}
	};

	while (true) {
		const leftDiff =
			left >= 0 ? Math.abs(candidates[left].timeMs - targetMs) : Infinity;
		const rightDiff =
			right < candidates.length
				? Math.abs(candidates[right].timeMs - targetMs)
				: Infinity;
		const nextDiff = Math.min(leftDiff, rightDiff);

		if (nextDiff === Infinity || nextDiff > toleranceMs) {
			break;
		}

		if (leftDiff === nextDiff) {
			consider(left);
			left--;
		}
		if (rightDiff === nextDiff) {
			consider(right);
			right++;
		}
	}

	return bestSourceIndex;
}

export function matchTextsByTime<TSource>(
	sources: readonly TSource[],
	targetTimes: readonly number[],
	{
		getText,
		getTimeVariants,
		strictToleranceMs = 3000,
		looseToleranceMs = 15000,
		fallbackToleranceMs = 30000,
		allowReuseSources = false,
	}: MatchTextsByTimeOptions<TSource>,
): string[] {
	if (sources.length === 0 || targetTimes.length === 0) {
		return new Array(targetTimes.length).fill("");
	}

	const timeCandidates = buildTimeCandidates(sources, getTimeVariants);
	if (timeCandidates.length === 0) {
		return new Array(targetTimes.length).fill("");
	}

	const result: string[] = new Array(targetTimes.length).fill("");
	const nearestMatches = targetTimes.map((targetTime, targetIndex) => ({
		targetIndex,
		...findNearestSourceMatch(timeCandidates, targetTime),
	}));

	nearestMatches.sort((a, b) => a.diff - b.diff);

	const usedSourceIndices = new Set<number>();
	const assignWithinTolerance = (toleranceMs: number) => {
		for (const match of nearestMatches) {
			if (result[match.targetIndex]) continue;

			const sourceIndex = allowReuseSources
				? findNearestSourceMatch(timeCandidates, targetTimes[match.targetIndex])
						.sourceIndex
				: findBestAvailableSourceIndex(
						timeCandidates,
						targetTimes[match.targetIndex],
						usedSourceIndices,
						toleranceMs,
					);
			if (sourceIndex < 0) continue;

			if (!allowReuseSources) {
				usedSourceIndices.add(sourceIndex);
			}
			const assignedText = getText(sources[sourceIndex]);
			if (!assignedText?.trim()) {
			}

			result[match.targetIndex] = assignedText;
		}
	};

	assignWithinTolerance(strictToleranceMs);
	assignWithinTolerance(looseToleranceMs);
	assignWithinTolerance(fallbackToleranceMs);

	return result;
}
