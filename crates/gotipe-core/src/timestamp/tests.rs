use super::*;

fn at(seconds: i64, nanos: u32) -> Timestamp {
    Timestamp::from_unix(seconds, nanos).expect("an instant in the years 0000 to 9999")
}

#[test]
fn writes_utc_with_the_fraction_it_needs() {
    assert_eq!(at(0, 0).to_string(), "1970-01-01T00:00:00Z");
    assert_eq!(at(-1, 0).to_string(), "1969-12-31T23:59:59Z");
    assert_eq!(at(951_782_400, 0).to_string(), "2000-02-29T00:00:00Z");
    assert_eq!(
        at(1_700_000_000, 534_000_000).to_string(),
        "2023-11-14T22:13:20.534Z"
    );
    assert_eq!(
        at(1_700_000_000, 534_331_000).to_string(),
        "2023-11-14T22:13:20.534331Z"
    );
    assert_eq!(
        at(1_700_000_000, 534_331_007).to_string(),
        "2023-11-14T22:13:20.534331007Z"
    );
    assert_eq!(at(FIRST_SECOND, 0).to_string(), "0000-01-01T00:00:00Z");
    assert_eq!(
        at(LAST_SECOND, 999_999_999).to_string(),
        "9999-12-31T23:59:59.999999999Z"
    );
}

#[test]
fn reads_offsets_separators_and_long_fractions() {
    let instant = at(1_700_000_000, 500_000_000);
    for text in [
        "2023-11-14T22:13:20.5Z",
        "2023-11-14t22:13:20.500z",
        "2023-11-14 22:13:20.500000000Z",
        "2023-11-15T01:13:20.5+03:00",
        "2023-11-15T01:13:20.5+0300",
        "2023-11-14T17:43:20.5-04:30",
        "2023-11-14T22:13:20.5000000009Z",
    ] {
        assert_eq!(text.parse(), Ok(instant), "{text}");
    }
}

#[test]
fn a_leap_second_runs_into_the_next_minute() {
    assert_eq!("2016-12-31T23:59:60Z".parse(), Ok(at(1_483_228_800, 0)));
}

#[test]
fn refuses_text_that_is_not_an_instant() {
    for text in [
        "",
        "2023-11-14",
        "2023-11-14T22:13:20",
        "2023-02-29T00:00:00Z",
        "2023-04-31T00:00:00Z",
        "2024-13-01T00:00:00Z",
        "2023-11-14T24:00:00Z",
        "2023-11-14T22:60:00Z",
        "2023-11-14T22:13:61Z",
        "2023-11-14T22:13:20.Z",
        "2023-11-14T22:13:20+24:00",
        "2023-11-14T22:13:20+03",
        "2023-11-14T22:13:20Z ",
        " 2023-11-14T22:13:20Z",
        "+2023-11-14T22:13:20Z",
        "20231-11-14T22:13:20Z",
        "0000-01-01T00:00:00+00:01",
        "２０２３-11-14T22:13:20Z",
    ] {
        assert!(text.parse::<Timestamp>().is_err(), "{text}");
    }
}

#[test]
fn from_unix_keeps_to_the_written_years() {
    assert!(Timestamp::from_unix(0, NANOS_PER_SECOND).is_none());
    assert!(Timestamp::from_unix(FIRST_SECOND - 1, 0).is_none());
    assert!(Timestamp::from_unix(LAST_SECOND + 1, 0).is_none());
    let instant = at(-1, 5);
    assert_eq!((instant.unix_seconds(), instant.subsec_nanos()), (-1, 5));
}

#[test]
fn the_calendar_agrees_with_itself_on_every_day() {
    for days in FIRST_SECOND / SECONDS_PER_DAY..=LAST_SECOND / SECONDS_PER_DAY {
        let (year, month, day) = civil_from_days(days);
        assert!((1..=12).contains(&month) && (1..=days_in_month(year, month)).contains(&day));
        assert_eq!(days_from_civil(year, month, day), days);
    }
}

#[test]
fn text_round_trips_across_the_years() {
    let mut seconds = FIRST_SECOND;
    while seconds <= LAST_SECOND {
        for nanos in [0, 120_000_000, 123_456_000, 123_456_789] {
            let instant = at(seconds, nanos);
            assert_eq!(instant.to_string().parse(), Ok(instant));
        }
        // 29 days and an hour: every day of the month and hour of the day come round
        seconds += 29 * SECONDS_PER_DAY + 3_607;
    }
}

#[test]
fn serde_carries_the_text() {
    let instant = at(1_700_000_000, 534_331_000);
    let json = serde_json::to_string(&instant).unwrap();
    assert_eq!(json, "\"2023-11-14T22:13:20.534331Z\"");
    assert_eq!(serde_json::from_str::<Timestamp>(&json).unwrap(), instant);
    assert!(serde_json::from_str::<Timestamp>("\"yesterday\"").is_err());
    assert!(serde_json::from_str::<Timestamp>("1700000000").is_err());
}

#[cfg(feature = "clock")]
#[test]
fn now_is_a_present_day_instant() {
    let now = Timestamp::now();
    // after 2025-01-01T00:00:00Z
    assert!(now > at(1_735_689_600, 0));
    assert_eq!(now.to_string().parse(), Ok(now));
}
