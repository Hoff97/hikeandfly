use super::Line;

#[test]
fn test_num_pixels() {
    assert_eq!(Line::new((5, 8), (1, 2)).num_pixels(), 4);
    assert_eq!(Line::new((8, 5), (1, 2)).num_pixels(), 4);
    assert_eq!(Line::new((5, 8), (11, 18)).num_pixels(), 8);
    assert_eq!(Line::new((5, 8), (18, 11)).num_pixels(), 8);
}

#[test]
fn test_line_1() {
    let line = Line::new((5, 8), (1, 2));
    let elements: Vec<_> = line.iter().collect();

    assert!(!line.iterator_reversed());
    assert_eq!(elements.len(), line.num_pixels());
    assert_eq!(elements, vec![(5, 1), (6, 1), (7, 2), (8, 2)]);
}

#[test]
fn test_line_2() {
    let line = Line::new((8, 5), (1, 2));
    let elements: Vec<_> = line.iter().collect();

    assert!(line.iterator_reversed());
    assert_eq!(elements.len(), line.num_pixels());
    assert_eq!(elements, vec![(5, 2), (6, 2), (7, 1), (8, 1)]);
}

#[test]
fn test_line_3() {
    let line = Line::new((1, 2), (5, 8));
    let elements: Vec<_> = line.iter().collect();

    assert!(!line.iterator_reversed());
    assert_eq!(elements.len(), line.num_pixels());
    assert_eq!(elements, vec![(1, 5), (1, 6), (2, 7), (2, 8)]);
}

#[test]
fn test_line_4() {
    let line = Line::new((1, 2), (8, 5));
    let elements: Vec<_> = line.iter().collect();

    assert!(line.iterator_reversed());
    assert_eq!(elements.len(), line.num_pixels());
    assert_eq!(elements, vec![(2, 5), (2, 6), (1, 7), (1, 8)]);
}
