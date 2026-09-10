/**
 * 선수 닉네임 생성기입니다.
 * 짧고 읽기 쉬운 영문 한 단어 닉네임만 생성합니다.
 */

export class NicknameGenerator {
  // 짧은 무기·동물·자연·추상 명사 후보입니다.
  private readonly words = [
    'ash', 'bear', 'bolt', 'claw', 'dawn', 'drake', 'ember', 'fang', 'fern',
    'flint', 'fox', 'glow', 'gloom', 'hawk', 'iron', 'jade', 'lark', 'mist',
    'moss', 'nova', 'onyx', 'raven', 'reed', 'rune', 'sable', 'shade', 'shard',
    'slate', 'spark', 'thorn', 'tide', 'vale', 'vex', 'wisp', 'wolf',
  ];
  // 발음 가능한 두 음절 로마자 조어의 앞·뒤 음절입니다.
  private readonly firstSyllables = ['ba', 'be', 'da', 'de', 'fa', 'ga', 'ka', 'la', 'ma', 'na', 'ra', 'sa', 'ta', 'va'];
  private readonly lastSyllables = ['bel', 'den', 'len', 'mar', 'mon', 'rel', 'ren', 'rin', 'sen', 'ter', 'ven', 'wyn'];
  // 짧은 접미사 변형입니다.
  private readonly suffixes = ['er', 'y', 'o'];
  // 알려진 실존 프로 ID와 생성된 닉네임을 모두 소문자로 보관합니다.
  private readonly blockedNicknames = new Set([
    'chovy', 'keria', 'oner', 'kiin', 'faker', 'deft', 'ruler', 'canyon',
    'showmaker', 'bengi', 'bang', 'wolf', 'peanut', 'viper', 'zeus', 'gumayusi',
    'teddy', 'score', 'mata', 'ambition', 'caps', 'rekkles', 'jankos', 'perkz',
    'doublelift', 'bjergsen', 'uzi', 'meiko', 'xiaohu', 'knight', 'scout',
  ]);
  // 중복 검사를 위한 저장소입니다.
  private readonly generatedNicknames = new Set<string>();

  /**
   * 규칙에 맞는 후보 하나를 무작위로 만듭니다.
   */
  private createCandidate(): string {
    const method = Math.floor(Math.random() * 3);
    let candidate: string;

    if (method === 0) {
      candidate = this.pick(this.words);
    } else {
      candidate = `${this.pick(this.firstSyllables)}${this.pick(this.lastSyllables)}`;
    }

    if (method === 2) {
      candidate += this.pick(this.suffixes);
    }

    return `${candidate[0].toUpperCase()}${candidate.slice(1).toLowerCase()}`;
  }

  /**
   * 배열에서 임의의 값 하나를 반환합니다.
   */
  private pick(values: string[]): string {
    return values[Math.floor(Math.random() * values.length)];
  }

  /**
   * 고유한 닉네임을 생성합니다.
   * 유한 횟수 안에 만들지 못하면 원인을 드러내는 오류를 던집니다.
   */
  public generateUniqueNickname(): string {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const nickname = this.createCandidate();
      const normalized = nickname.toLowerCase();

      if (!this.blockedNicknames.has(normalized) && !this.generatedNicknames.has(normalized)) {
        this.generatedNicknames.add(normalized);
        return nickname;
      }
    }

    throw new Error('고유한 닉네임을 200회 시도했지만 생성하지 못했습니다.');
  }
}