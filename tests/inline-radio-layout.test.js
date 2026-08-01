const fs = require('fs');
const path = require('path');

// The options page styles every `input` at width:100% — twice, via `input, select` and
// `.action-item input`. Radio buttons are inputs too, so those rules stretched each radio
// into a full-width box that flex then shrank, leaving the dots evenly spread across the
// row and far from their labels. `.inline-radio` has to out-rank both rules.
//
// jsdom resolves the cascade by source order rather than specificity, so this test only
// passes while .inline-radio wins on BOTH counts — which is what keeps the real browser
// safe if either of the width:100% rules is later moved or made more specific.
describe('.inline-radio layout (Follow / Reviewed / Agree target groups)', () => {
    const optionsHtml = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');

    const render = () => {
        const css = optionsHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
        document.head.innerHTML = `<style>${css}</style>`;
        // Mirrors the markup addActionToForm builds: actionDiv.className = 'action-item'.
        document.body.innerHTML = `
            <div class="action-item">
                <div class="inline-radio">
                    <input type="radio" id="opt-a" name="agreeTarget-x" value="community" checked>
                    <label for="opt-a">Community ID</label>
                    <input type="radio" id="opt-b" name="agreeTarget-x" value="displayed">
                    <label for="opt-b">Displayed ID</label>
                </div>
            </div>`;
        return {
            radio: document.getElementById('opt-a'),
            label: document.querySelector('label[for="opt-a"]'),
            group: document.querySelector('.inline-radio')
        };
    };

    test('radios are not stretched by the width:100% input rules', () => {
        const { radio } = render();
        const style = getComputedStyle(radio);
        expect(style.width).toBe('auto');
        expect(style.flex).toBe('0 0 auto');
    });

    test('radios do not carry the global input padding or bottom margin', () => {
        const { radio } = render();
        const style = getComputedStyle(radio);
        expect(style.padding).toBe('0px');
        expect(style.marginBottom).toBe('0px');
    });

    test('a radio sits tight against its own label', () => {
        const { radio } = render();
        expect(getComputedStyle(radio).marginRight).toBe('5px');
    });

    test('the space between options is wider than the space within one', () => {
        const { radio, label } = render();
        const within = parseInt(getComputedStyle(radio).marginRight, 10);
        const between = parseInt(getComputedStyle(label).marginRight, 10);
        expect(between).toBeGreaterThan(within);
    });

    test('no flex gap, which would separate each radio from its own label', () => {
        const { group } = render();
        const gap = getComputedStyle(group).gap;
        expect(gap === '' || gap === 'normal' || gap === '0px').toBe(true);
    });

    test('the group wraps instead of squeezing when the row is narrow', () => {
        const { group } = render();
        expect(getComputedStyle(group).flexWrap).toBe('wrap');
    });

    // The radio groups are the last thing above the red Remove Action button, so a click
    // that lands slightly low would delete the action instead of picking an option.
    test.each(['follow-options', 'reviewed-options', 'agree-options'])(
        '.%s keeps clear of the Remove Action button',
        (className) => {
            const css = optionsHtml.match(/<style>([\s\S]*?)<\/style>/)[1];
            document.head.innerHTML = `<style>${css}</style>`;
            document.body.innerHTML = `
                <div class="action-item">
                    <div class="${className}">
                        <div class="inline-radio">
                            <input type="radio" id="r" name="t" value="a" checked>
                            <label for="r">Option</label>
                        </div>
                    </div>
                    <button class="removeActionButton">Remove Action</button>
                </div>`;
            const wrapper = document.querySelector(`.${className}`);
            expect(parseInt(getComputedStyle(wrapper).marginBottom, 10)).toBeGreaterThanOrEqual(12);
        }
    );
});
