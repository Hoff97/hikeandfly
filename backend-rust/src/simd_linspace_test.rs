use super::linspace_simd;

#[test]
fn test_linspace_simd_4() {
    let start = 0.0;
    let end = 8.0;
    let n = 9;
    let linspace = linspace_simd::<4>(start, end, n);

    let mut iter = linspace.iter();
    assert_eq!(
        iter.next().map(|x| x.to_array()),
        Some([0.0, 1.0, 2.0, 3.0])
    );
    assert_eq!(
        iter.next().map(|x| x.to_array()),
        Some([4.0, 5.0, 6.0, 7.0])
    );
    assert_eq!(iter.next(), None);

    let mut reminder = linspace.reminder();
    assert_eq!(reminder.next(), Some(8.0));
    assert_eq!(reminder.next(), None);
}

#[test]
fn test_linspace_simd_4_fractional() {
    let start = 0.0;
    let end = 2.5;
    let n = 11;
    let linspace = linspace_simd::<4>(start, end, n);

    let mut iter = linspace.iter();
    assert_eq!(
        iter.next().map(|x| x.to_array()),
        Some([0.0, 0.25, 0.5, 0.75])
    );
    assert_eq!(
        iter.next().map(|x| x.to_array()),
        Some([1.0, 1.25, 1.5, 1.75])
    );
    assert_eq!(iter.next(), None);

    let mut reminder = linspace.reminder();
    assert_eq!(reminder.next(), Some(2.0));
    assert_eq!(reminder.next(), Some(2.25));
    assert_eq!(reminder.next(), Some(2.5));
    assert_eq!(reminder.next(), None);
}

#[test]
fn test_linspace_simd_8() {
    let start = 0.0;
    let end = 10.0;
    let n = 11;
    let linspace = linspace_simd::<8>(start, end, n);

    let mut iter = linspace.iter();
    assert_eq!(
        iter.next().map(|x| x.to_array()),
        Some([0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0])
    );
    assert_eq!(iter.next(), None);

    let mut reminder = linspace.reminder();
    assert_eq!(reminder.next(), Some(8.0));
    assert_eq!(reminder.next(), Some(9.0));
    assert_eq!(reminder.next(), Some(10.0));
    assert_eq!(reminder.next(), None);
}
