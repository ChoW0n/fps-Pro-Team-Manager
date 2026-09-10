/**
 * 한국식 선수 본명 생성기입니다.
 * 성과 두 이름 음절을 조합해 중복 없는 본명을 만듭니다.
 */

export class KoreanNameGenerator {
  // 한국식 성 후보입니다.
  private readonly surnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '한', '오', '서'];
  // 본명에 사용할 이름 음절 후보입니다.
  private readonly nameSyllables = ['도', '현', '민', '준', '서', '진', '우', '빈', '태', '영', '재', '훈', '성', '호', '규', '찬', '건', '혁', '원', '석'];
  // 알려진 실존 프로게이머 본명을 제외합니다.
  private readonly blockedNames = new Set(['이상혁', '한왕호', '허수', '김혁규', '박재혁', '류민석', '문현준', '최우제']);
  // 생성한 본명을 보관해 중복을 막습니다.
  private readonly generatedNames = new Set<string>();

  /**
   * 중복되지 않는 성과 두 음절의 한국식 본명을 반환합니다.
   */
  public generateUniqueName(): string {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const firstSyllable = this.pick(this.nameSyllables);
      const secondSyllable = this.pick(this.nameSyllables);
      // 같은 음절이 연속되는 어색한 본명은 사용하지 않습니다.
      if (firstSyllable === secondSyllable) continue;

      const name = `${this.pick(this.surnames)}${firstSyllable}${secondSyllable}`;

      if (!this.blockedNames.has(name) && !this.generatedNames.has(name)) {
        this.generatedNames.add(name);
        return name;
      }
    }

    throw new Error('고유한 한국식 본명을 200회 시도했지만 생성하지 못했습니다.');
  }

  /**
   * 배열에서 임의의 문자열 하나를 반환합니다.
   */
  private pick(values: string[]): string {
    return values[Math.floor(Math.random() * values.length)];
  }
}