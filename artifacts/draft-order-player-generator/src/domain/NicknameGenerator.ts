/**
 * 닉네임 생성기 클래스
 * 짧은 영단어를 조합하여 무작위로 선수 닉네임을 생성하며, 중복을 방지합니다.
 */

export class NicknameGenerator {
  // 무기 관련 영단어 목록
  private weapons = ['Sword', 'Spear', 'Bow', 'Axe', 'Dagger', 'Shield', 'Blade', 'Arrow'];
  // 동물 관련 영단어 목록
  private animals = ['Wolf', 'Bear', 'Hawk', 'Lion', 'Tiger', 'Shark', 'Viper', 'Fox'];
  // 신화 관련 영단어 목록
  private myths = ['Zeus', 'Ares', 'Hades', 'Thor', 'Odin', 'Loki', 'Titan', 'Ghost'];
  // 자연 관련 영단어 목록
  private natures = ['Storm', 'Fire', 'Ice', 'Wind', 'Thunder', 'Shadow', 'Light', 'Stone'];
  
  // 중복 검사를 위한 저장소
  private generatedNicknames = new Set<string>();

  /**
   * 고유한 닉네임을 생성하여 반환합니다.
   * 이미 생성된 닉네임일 경우 재귀적으로 다시 생성합니다.
   */
  public generateUniqueNickname(): string {
    const categories = [this.weapons, this.animals, this.myths, this.natures];
    
    // 단어를 2개 또는 3개 조합할지 결정
    const wordCount = Math.random() > 0.5 ? 2 : 3;
    
    // 카테고리를 무작위로 섞음
    const shuffledCategories = [...categories].sort(() => 0.5 - Math.random());
    const selectedCategories = shuffledCategories.slice(0, wordCount);
    
    // 선택된 카테고리에서 무작위로 단어 하나씩 추출
    const words = selectedCategories.map(
      category => category[Math.floor(Math.random() * category.length)]
    );
    
    let nickname = words.join('');

    // 30% 확률로 숫자(1~99)를 접미사로 추가
    if (Math.random() < 0.3) {
      const suffix = Math.floor(Math.random() * 99) + 1;
      nickname += suffix.toString();
    }

    // 중복 닉네임인 경우 재시도
    if (this.generatedNicknames.has(nickname)) {
      return this.generateUniqueNickname();
    }

    this.generatedNicknames.add(nickname);
    return nickname;
  }
}
