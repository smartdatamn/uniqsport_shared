/**
 * Reader for /comp/event/config.
 *
 * compware computes the registration window itself, in Ulaanbaatar time:
 * isStarted / isFinished / isPaymentFinished / isUpdateFinished. Those four
 * booleans are authoritative. This reader exposes ONLY them — it deliberately
 * offers nothing that would let a client recompute the window from the raw
 * dates, because a browser doing that in its own timezone shows a user abroad
 * the wrong answer.
 *
 * eventType 1 is a sport competition, 2 an olympiad: when no uq_event_config
 * row matches, compware falls through to the olympiad controller, whose
 * payload is similar but not identical. Branch on eventType.
 */

export const EVENT_TYPE = Object.freeze({ COMPETITION: 1, OLYMPIAD: 2 });

/**
 * @param {object|null} raw the raw JSON from /comp/event/config
 * @returns {null | Readonly<{
 *   eventType: number, isOlympiad: boolean, config: object,
 *   isStarted: boolean, isFinished: boolean,
 *   isPaymentFinished: boolean, isUpdateFinished: boolean,
 *   isTeam: boolean, genders: Array<{gender_code: string|number, total: number}>
 * }>}
 */
export function readEventConfig(raw) {
    if (!raw || raw.status !== true || !raw.data || typeof raw.data !== 'object') {
        return null;
    }

    const eventType = Number(raw.eventType) || EVENT_TYPE.COMPETITION;

    return Object.freeze({
        eventType,
        isOlympiad: eventType === EVENT_TYPE.OLYMPIAD,
        config: raw.data,
        isStarted: raw.isStarted === true,
        isFinished: raw.isFinished === true,
        isPaymentFinished: raw.isPaymentFinished === true,
        isUpdateFinished: raw.isUpdateFinished === true,
        isTeam: raw.data.is_team === true || raw.data.is_team === 1 || raw.data.is_team === '1',
        genders: Array.isArray(raw.genders) ? raw.genders : [],
    });
}

/**
 * Where registration stands, from the server's own booleans.
 * @returns {'not_started'|'open'|'closed'|'unknown'}
 */
export function registrationWindow(eventConfig) {
    if (!eventConfig) return 'unknown';
    if (!eventConfig.isStarted) return 'not_started';
    if (eventConfig.isFinished) return 'closed';
    return 'open';
}

/** Whether a registration can still be paid for. */
export function canPay(eventConfig) {
    return !!eventConfig && !eventConfig.isPaymentFinished;
}

/** Whether an existing registration can still be edited. */
export function canEdit(eventConfig) {
    return !!eventConfig && !eventConfig.isUpdateFinished;
}
