// ======================================================
// DETALHAMENTO DA CATEGORIA
// ======================================================

function abrirDetalheCategoria(categoria) {

    const ano =
        Number(document.getElementById("ifAno").value);

    const mes =
        document.getElementById("ifMes").value;

    const registros = lancamentos
        .filter(l => {

            if (String(l[2]).toUpperCase() !== "SAIDA")
                return false;

            if (l[3] !== categoria)
                return false;

            const data = new Date(formatarDataISO(l[1]));

            if (data.getFullYear() !== ano)
                return false;

            if (
                mes !== "" &&
                data.getMonth() !== Number(mes)
            )
                return false;

            return true;

        })
        .sort(
            (a, b) =>
                new Date(formatarDataISO(b[1])) -
                new Date(formatarDataISO(a[1]))
        );

    let total = 0;

    registros.forEach(l => {

        total += parseValorBR(l[7]);

    });

    let html = `

    <div class="modal-edicao">

        <div class="modal-overlay"
             onclick="this.parentElement.remove()"></div>

        <div class="modal-box">

            <h3>

                ${obterEmojiCategoria(categoria)}
                ${categoria}

            </h3>

            <p>

                <strong>Total:</strong>
                ${formatMoney(total)}

            </p>

            <hr>

    `;

    if (!registros.length) {

        html += `

            <p>

                Nenhum lançamento encontrado.

            </p>

        `;

    } else {

        registros.forEach(l => {

            html += `

                <div class="modal-item">

                    <div>

                        <strong>

                            ${formatarDataBR(l[1])}

                        </strong>

                        <br>

                        ${l[8] || "-"}

                    </div>

                    <strong>

                        ${formatMoney(parseValorBR(l[7]))}

                    </strong>

                </div>

            `;

        });

    }

    html += `

            <div class="modal-acoes">

                <button
                    onclick="this.closest('.modal-edicao').remove()">

                    Fechar

                </button>

            </div>

        </div>

    </div>

    `;

    document.body.insertAdjacentHTML(

        "beforeend",

        html

    );

}
