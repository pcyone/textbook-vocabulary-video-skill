export function microcourseUnit(lesson) {
 const unit = lesson.unitId ?? 'unit01';
 if (!/^unit\d{2}$/.test(unit)) throw new Error('Invalid microcourse unit');
 return unit;
}
