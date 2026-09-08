/**
 * 팀 이름 생성기 클래스
 * 실존 팀 목록 없이 짧은 영단어를 조합해 고유한 팀 이름을 만듭니다.
 */

export class TeamNameGenerator {
  // 팀 이름 앞부분에 사용하는 자연·방향 단어 목록
  private readonly prefixes = ['Crimson', 'Northern', 'Silent', 'Solar', 'Iron', 'Azure'];

  // 팀 이름 뒷부분에 사용하는 동물·상징 단어 목록
  private readonly nouns = ['Ravens', 'Comets', 'Bisons', 'Fangs', 'Owls', 'Waves'];

  // 중복 검사를 위한 팀 이름 저장소
  private readonly generatedNames = new Set<string>();

  /**
   * 아직 사용하지 않은 팀 이름을 생성합니다.
   */
  public generateUniqueName(): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const prefix = this.prefixes[Math.floor(Math.random() * this.prefixes.length)];
      const noun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
      const name = `${prefix} ${noun}`;

      if (!this.generatedNames.has(name)) {
        this.generatedNames.add(name);
        return name;
      }
    }

    throw new Error('고유한 팀 이름을 생성하지 못했습니다.');
  }
}