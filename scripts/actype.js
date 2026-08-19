 document.addEventListener("DOMContentLoaded", function () {

      const database =
        firebase.database();

      const rootRef =
        database.ref("aircraftTypes");


      const aircraftEditor =
        document.getElementById("aircraftEditor");

      const editorTitle =
        document.getElementById("editorTitle");

      const aircraftForm =
        document.getElementById("aircraftForm");


      const airlineName =
        document.getElementById("airlineName");

      const airlineIata =
        document.getElementById("airlineIata");

      const airlineIcao =
        document.getElementById("airlineIcao");

      const airlineNameSuggestions =
        document.getElementById("airlineNameSuggestions");


      const inputCode =
        document.getElementById("inputCode");

      const scrCode =
        document.getElementById("scrCode");

      const seats =
        document.getElementById("seats");

      const aircraftName =
        document.getElementById("aircraftName");


      const originalAirlineIcao =
        document.getElementById("originalAirlineIcao");

      const originalAircraftCode =
        document.getElementById("originalAircraftCode");


      const newAircraftBtn =
        document.getElementById("newAircraftBtn");

      const saveAircraftBtn =
        document.getElementById("saveAircraftBtn");

      const deleteAircraftBtn =
        document.getElementById("deleteAircraftBtn");

      const cancelEditBtn =
        document.getElementById("cancelEditBtn");


      const previewAirline =
        document.getElementById("previewAirline");

      const previewInput =
        document.getElementById("previewInput");

      const previewScr =
        document.getElementById("previewScr");

      const previewSeats =
        document.getElementById("previewSeats");


      const formMessage =
        document.getElementById("formMessage");


      const aircraftSearch =
        document.getElementById("aircraftSearch");

      const clearSearchBtn =
        document.getElementById("clearSearchBtn");

      const airlineFilter =
        document.getElementById("airlineFilter");

      const sortSelect =
        document.getElementById("sortSelect");


      const aircraftTableBody =
        document.getElementById("aircraftTableBody");

      const aircraftTableContainer =
        document.getElementById("aircraftTableContainer");

      const databaseLoading =
        document.getElementById("databaseLoading");

      const emptyDatabase =
        document.getElementById("emptyDatabase");

      const emptyDatabaseText =
        document.getElementById("emptyDatabaseText");


      const connectionStatus =
        document.getElementById("connectionStatus");

      const connectionText =
        document.getElementById("connectionText");

      const statusText =
        document.getElementById("statusText");


      const deleteModal =
        document.getElementById("deleteModal");

      const deleteAircraftName =
        document.getElementById("deleteAircraftName");

      const confirmDeleteBtn =
        document.getElementById("confirmDeleteBtn");

      const cancelDeleteBtn =
        document.getElementById("cancelDeleteBtn");

      const modalCloseBtn =
        document.getElementById("modalCloseBtn");


      let rawDatabase = {};

      let airlines = {};

      let aircraftRecords = [];

      let selectedRecordId = null;


      function normaliseCode(value) {

        return String(
          value || ""
        )
          .trim()
          .toUpperCase();

      }


      function formatSeats(value) {

        if (
          value === "" ||
          value === null ||
          typeof value === "undefined"
        ) {

          return "";

        }


        const number =
          parseInt(
            value,
            10
          );


        if (
          Number.isNaN(number)
        ) {

          return "";

        }


        return String(number)
          .padStart(
            3,
            "0"
          );

      }


      function validCode(value) {

        return /^[A-Z0-9-]+$/
          .test(value);

      }


      function uppercaseInput(element) {

        element.addEventListener(
          "input",
          function () {

            const position =
              element.selectionStart;


            element.value =
              element.value.toUpperCase();


            try {

              element.setSelectionRange(
                position,
                position
              );

            } catch (error) {
            }


            updatePreview();

          }
        );

      }


      uppercaseInput(
        airlineIata
      );

      uppercaseInput(
        airlineIcao
      );

      uppercaseInput(
        inputCode
      );

      uppercaseInput(
        scrCode
      );


      function updateStatus(message) {

        statusText.textContent =
          message || "Ready";

      }


      function setMessage(
        message,
        type
      ) {

        formMessage.textContent =
          message || "";


        formMessage.classList.remove(
          "success",
          "error",
          "warning"
        );


        if (
          message &&
          type
        ) {

          formMessage.classList.add(
            type
          );

        }

      }


      function updatePreview() {

        previewAirline.textContent =
          airlineIata.value.trim()
            ? normaliseCode(
                airlineIata.value
              )
            : "---";


        previewInput.textContent =
          normaliseCode(
            inputCode.value
          ) || "---";


        previewScr.textContent =
          normaliseCode(
            scrCode.value
          ) || "---";


        previewSeats.textContent =
          formatSeats(
            seats.value
          ) || "---";

      }


      airlineName.addEventListener(
        "input",
        function () {

          updatePreview();


          const typedName =
            airlineName.value
              .trim()
              .toLowerCase();


          const matchingAirline =
            Object.values(
              airlines
            )
              .find(
                function (airline) {

                  return (
                    airline.name
                      .toLowerCase() ===
                    typedName
                  );

                }
              );


          if (
            matchingAirline &&
            !originalAircraftCode.value
          ) {

            airlineIata.value =
              matchingAirline.iata;

            airlineIcao.value =
              matchingAirline.icao;


            updatePreview();

          }

        }
      );


      seats.addEventListener(
        "input",
        updatePreview
      );


      function showNewAircraftForm() {

        aircraftForm.reset();


        originalAirlineIcao.value =
          "";

        originalAircraftCode.value =
          "";

        selectedRecordId =
          null;


        editorTitle.textContent =
          "New Aircraft";


        saveAircraftBtn.textContent =
          "Save Aircraft";


        deleteAircraftBtn
          .classList
          .add("hidden");


        setMessage(
          "",
          ""
        );


        aircraftEditor
          .classList
          .remove("hidden");


        updatePreview();

        renderTable();


        updateStatus(
          "Creating new aircraft record"
        );


        airlineName.focus();


        aircraftEditor.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

      }


      function hideAircraftForm() {

        aircraftForm.reset();


        originalAirlineIcao.value =
          "";

        originalAircraftCode.value =
          "";

        selectedRecordId =
          null;


        aircraftEditor
          .classList
          .add("hidden");


        deleteAircraftBtn
          .classList
          .add("hidden");


        setMessage(
          "",
          ""
        );


        updatePreview();

        renderTable();


        updateStatus(
          "Ready"
        );

      }


      function editAircraft(record) {

        selectedRecordId =
          record.id;


        airlineName.value =
          record.airlineName;

        airlineIata.value =
          record.iata;

        airlineIcao.value =
          record.icao;


        inputCode.value =
          record.inputCode;

        scrCode.value =
          record.scrCode;

        seats.value =
          parseInt(
            record.seats || "0",
            10
          );

        aircraftName.value =
          record.name;


        originalAirlineIcao.value =
          record.icao;

        originalAircraftCode.value =
          record.aircraftKey;


        editorTitle.textContent =
          "Edit Aircraft Type";


        saveAircraftBtn.textContent =
          "Save Changes";


        deleteAircraftBtn
          .classList
          .remove("hidden");


        aircraftEditor
          .classList
          .remove("hidden");


        setMessage(
          "",
          ""
        );


        updatePreview();

        renderTable();


        updateStatus(
          "Editing " +
          record.airlineName +
          " " +
          record.inputCode
        );


        aircraftEditor.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

      }


      function parseDatabase() {

        airlines = {};

        aircraftRecords = [];


        Object.entries(
          rawDatabase || {}
        )
          .forEach(
            function (
              [
                airlineKey,
                airlineData
              ]
            ) {

              if (
                !airlineData ||
                typeof airlineData !== "object"
              ) {

                return;

              }


              if (
                !airlineData.aircraft
              ) {

                return;

              }


              const icao =
                normaliseCode(
                  airlineData.icaoCode ||
                  airlineKey
                );


              const iata =
                normaliseCode(
                  airlineData.iataCode
                );


              const name =
                String(
                  airlineData.airlineName ||
                  icao
                ).trim();


              airlines[icao] = {

                name:
                  name,

                iata:
                  iata,

                icao:
                  icao

              };


              Object.entries(
                airlineData.aircraft
              )
                .forEach(
                  function (
                    [
                      aircraftKey,
                      aircraft
                    ]
                  ) {

                    if (
                      !aircraft ||
                      typeof aircraft !== "object"
                    ) {

                      return;

                    }


                    aircraftRecords.push({

                      id:
                        icao +
                        "::" +
                        aircraftKey,

                      airlineName:
                        name,

                      iata:
                        iata,

                      icao:
                        icao,

                      aircraftKey:
                        aircraftKey,

                      inputCode:
                        normaliseCode(
                          aircraft.inputCode ||
                          aircraftKey
                        ),

                      scrCode:
                        normaliseCode(
                          aircraft.scrCode
                        ),

                      seats:
                        formatSeats(
                          aircraft.seats
                        ),

                      name:
                        String(
                          aircraft.name ||
                          ""
                        )

                    });

                  }
                );

            }
          );


        populateAirlineControls();

      }


      function populateAirlineControls() {

        const currentFilter =
          airlineFilter.value;


        airlineNameSuggestions.innerHTML =
          "";


        airlineFilter.innerHTML = `
          <option value="">
            All Airlines
          </option>
        `;


        Object.values(
          airlines
        )
          .sort(
            function (
              a,
              b
            ) {

              return a.name
                .localeCompare(
                  b.name
                );

            }
          )
          .forEach(
            function (
              airline
            ) {

              const suggestion =
                document.createElement(
                  "option"
                );

              suggestion.value =
                airline.name;


              airlineNameSuggestions
                .appendChild(
                  suggestion
                );


              const filterOption =
                document.createElement(
                  "option"
                );

              filterOption.value =
                airline.icao;

              filterOption.textContent =
                airline.name;


              airlineFilter
                .appendChild(
                  filterOption
                );

            }
          );


        if (
          currentFilter &&
          airlines[currentFilter]
        ) {

          airlineFilter.value =
            currentFilter;

        }

      }


      function renderTable() {

        const search =
          aircraftSearch.value
            .trim()
            .toUpperCase();


        const selectedAirline =
          airlineFilter.value;


        const sortMode =
          sortSelect.value;


        let filtered =
          aircraftRecords.filter(
            function (record) {


              if (
                selectedAirline &&
                record.icao !==
                  selectedAirline
              ) {

                return false;

              }


              if (
                !search
              ) {

                return true;

              }


              const searchable = [

                record.airlineName,
                record.iata,
                record.icao,

                record.inputCode,
                record.scrCode,
                record.seats,

                record.name

              ]
                .join(" ")
                .toUpperCase();


              return searchable
                .includes(
                  search
                );

            }
          );


        filtered.sort(
          function (
            a,
            b
          ) {

            if (
              sortMode ===
              "aircraft"
            ) {

              return a.inputCode
                .localeCompare(
                  b.inputCode,
                  undefined,
                  {
                    numeric: true
                  }
                );

            }


            if (
              sortMode ===
              "seats"
            ) {

              return (
                parseInt(
                  a.seats || 0,
                  10
                ) -
                parseInt(
                  b.seats || 0,
                  10
                )
              );

            }


            const airlineSort =
              a.airlineName
                .localeCompare(
                  b.airlineName
                );


            if (
              airlineSort !== 0
            ) {

              return airlineSort;

            }


            return a.inputCode
              .localeCompare(
                b.inputCode,
                undefined,
                {
                  numeric: true
                }
              );

          }
        );


        aircraftTableBody.innerHTML =
          "";


        databaseLoading
          .classList
          .add("hidden");


        if (
          filtered.length === 0
        ) {

          aircraftTableContainer
            .classList
            .add("hidden");


          emptyDatabase
            .classList
            .remove("hidden");


          emptyDatabaseText.textContent =
            (
              search ||
              selectedAirline
            )
              ? "No aircraft match the current search."
              : "No aircraft types are currently available.";


          return;

        }


        emptyDatabase
          .classList
          .add("hidden");


        aircraftTableContainer
          .classList
          .remove("hidden");


        filtered.forEach(
          function (
            record
          ) {

            const row =
              document.createElement(
                "tr"
              );


            if (
              record.id ===
              selectedRecordId
            ) {

              row.classList.add(
                "selected"
              );

            }


            const airlineCell =
              document.createElement(
                "td"
              );

            airlineCell.className =
              "airline-name-cell";

            airlineCell.textContent =
              record.airlineName;


            const iataCell =
              document.createElement(
                "td"
              );

            iataCell.className =
              "code-cell";

            iataCell.textContent =
              record.iata;


            const icaoCell =
              document.createElement(
                "td"
              );

            icaoCell.className =
              "code-cell";

            icaoCell.textContent =
              record.icao;


            const aircraftCell =
              document.createElement(
                "td"
              );

            aircraftCell.className =
              "code-cell";

            aircraftCell.textContent =
              record.inputCode;


            const scrCell =
              document.createElement(
                "td"
              );

            scrCell.className =
              "code-cell";

            scrCell.textContent =
              record.scrCode;


            const seatsCell =
              document.createElement(
                "td"
              );

            seatsCell.textContent =
              record.seats;


            const nameCell =
              document.createElement(
                "td"
              );

            nameCell.className =
              "aircraft-name-cell";

            nameCell.textContent =
              record.name;


            const actionCell =
              document.createElement(
                "td"
              );


            const editButton =
              document.createElement(
                "button"
              );

            editButton.type =
              "button";

            editButton.className =
              "edit-button";

            editButton.textContent =
              "Edit";


            editButton.addEventListener(
              "click",
              function (
                event
              ) {

                event.stopPropagation();


                editAircraft(
                  record
                );

              }
            );


            actionCell.appendChild(
              editButton
            );


            row.appendChild(
              airlineCell
            );

            row.appendChild(
              iataCell
            );

            row.appendChild(
              icaoCell
            );

            row.appendChild(
              aircraftCell
            );

            row.appendChild(
              scrCell
            );

            row.appendChild(
              seatsCell
            );

            row.appendChild(
              nameCell
            );

            row.appendChild(
              actionCell
            );


            row.addEventListener(
              "dblclick",
              function () {

                editAircraft(
                  record
                );

              }
            );


            aircraftTableBody
              .appendChild(
                row
              );

          }
        );

      }


      async function cleanupOldAirline(
        icao
      ) {

        if (
          !icao
        ) {

          return;

        }


        const aircraftSnapshot =
          await database
            .ref(
              "aircraftTypes/" +
              icao +
              "/aircraft"
            )
            .once(
              "value"
            );


        if (
          !aircraftSnapshot.exists()
        ) {

          await database
            .ref(
              "aircraftTypes/" +
              icao
            )
            .remove();

        }

      }


      rootRef.on(
        "value",
        function (
          snapshot
        ) {

          rawDatabase =
            snapshot.val() || {};


          parseDatabase();

          renderTable();


          updateStatus(
            "Aircraft database loaded"
          );

        },
        function (
          error
        ) {

          console.error(
            error
          );


          databaseLoading
            .classList
            .add("hidden");


          emptyDatabase
            .classList
            .remove("hidden");


          aircraftTableContainer
            .classList
            .add("hidden");


          emptyDatabaseText.textContent =
            "Unable to load aircraft database.";


          updateStatus(
            "Database error"
          );

        }
      );


      newAircraftBtn.addEventListener(
        "click",
        showNewAircraftForm
      );


      cancelEditBtn.addEventListener(
        "click",
        hideAircraftForm
      );


      aircraftForm.addEventListener(
        "submit",
        async function (
          event
        ) {

          event.preventDefault();


          setMessage(
            "",
            ""
          );


          const newAirlineName =
            airlineName.value
              .trim();


          const newIata =
            normaliseCode(
              airlineIata.value
            );


          const newIcao =
            normaliseCode(
              airlineIcao.value
            );


          const newAircraftCode =
            normaliseCode(
              inputCode.value
            );


          const newScrCode =
            normaliseCode(
              scrCode.value
            );


          const newSeats =
            formatSeats(
              seats.value
            );


          const newAircraftName =
            aircraftName.value
              .trim();


          if (
            !newAirlineName
          ) {

            setMessage(
              "Please enter the airline name.",
              "error"
            );

            airlineName.focus();

            return;

          }


          if (
            !newIata ||
            !validCode(
              newIata
            )
          ) {

            setMessage(
              "Please enter a valid airline IATA code.",
              "error"
            );

            airlineIata.focus();

            return;

          }


          if (
            !newIcao ||
            !validCode(
              newIcao
            )
          ) {

            setMessage(
              "Please enter a valid airline ICAO code.",
              "error"
            );

            airlineIcao.focus();

            return;

          }


          if (
            !newAircraftCode ||
            !validCode(
              newAircraftCode
            )
          ) {

            setMessage(
              "Please enter a valid aircraft type.",
              "error"
            );

            inputCode.focus();

            return;

          }


          if (
            !newScrCode ||
            !validCode(
              newScrCode
            )
          ) {

            setMessage(
              "Please enter a valid SCR aircraft code.",
              "error"
            );

            scrCode.focus();

            return;

          }


          if (
            !newSeats
          ) {

            setMessage(
              "Please enter total seats.",
              "error"
            );

            seats.focus();

            return;

          }


          if (
            !newAircraftName
          ) {

            setMessage(
              "Please enter the aircraft name.",
              "error"
            );

            aircraftName.focus();

            return;

          }


          const oldIcao =
            normaliseCode(
              originalAirlineIcao.value
            );


          const oldAircraftCode =
            normaliseCode(
              originalAircraftCode.value
            );


          const isEditing =
            Boolean(
              oldIcao &&
              oldAircraftCode
            );


          const duplicate =
            aircraftRecords.find(
              function (
                record
              ) {

                const sameRecord =
                  (
                    record.icao ===
                      oldIcao &&
                    record.inputCode ===
                      oldAircraftCode
                  );


                return (
                  record.icao ===
                    newIcao &&
                  record.inputCode ===
                    newAircraftCode &&
                  !sameRecord
                );

              }
            );


          if (
            duplicate
          ) {

            setMessage(
              newAircraftCode +
              " already exists for " +
              duplicate.airlineName +
              ".",
              "error"
            );

            return;

          }


          const updates = {};


          updates[
            "aircraftTypes/" +
            newIcao +
            "/airlineName"
          ] =
            newAirlineName;


          updates[
            "aircraftTypes/" +
            newIcao +
            "/iataCode"
          ] =
            newIata;


          updates[
            "aircraftTypes/" +
            newIcao +
            "/icaoCode"
          ] =
            newIcao;


          updates[
            "aircraftTypes/" +
            newIcao +
            "/aircraft/" +
            newAircraftCode
          ] = {

            inputCode:
              newAircraftCode,

            scrCode:
              newScrCode,

            seats:
              newSeats,

            name:
              newAircraftName

          };


          if (
            isEditing &&
            (
              oldIcao !==
                newIcao ||
              oldAircraftCode !==
                newAircraftCode
            )
          ) {

            updates[
              "aircraftTypes/" +
              oldIcao +
              "/aircraft/" +
              oldAircraftCode
            ] =
              null;

          }


          saveAircraftBtn.disabled =
            true;


          saveAircraftBtn.textContent =
            "Saving...";


          updateStatus(
            "Saving aircraft..."
          );


          try {

            await database
              .ref()
              .update(
                updates
              );


            if (
              isEditing &&
              oldIcao !==
                newIcao
            ) {

              await cleanupOldAirline(
                oldIcao
              );

            }


            originalAirlineIcao.value =
              newIcao;


            originalAircraftCode.value =
              newAircraftCode;


            selectedRecordId =
              newIcao +
              "::" +
              newAircraftCode;


            editorTitle.textContent =
              "Edit Aircraft Type";


            saveAircraftBtn.textContent =
              "Save Changes";


            deleteAircraftBtn
              .classList
              .remove("hidden");


            setMessage(
              isEditing
                ? "Aircraft type updated successfully."
                : "Aircraft type added successfully.",
              "success"
            );


            updateStatus(
              newAirlineName +
              " " +
              newAircraftCode +
              " saved"
            );

          }

          catch (
            error
          ) {

            console.error(
              "Aircraft save error:",
              error
            );


            setMessage(
              "Firebase rejected the change. Check the aircraftTypes database rules.",
              "error"
            );


            updateStatus(
              "Save failed"
            );

          }

          finally {

            saveAircraftBtn.disabled =
              false;


            saveAircraftBtn.textContent =
              originalAircraftCode.value
                ? "Save Changes"
                : "Save Aircraft";

          }

        }
      );


      deleteAircraftBtn.addEventListener(
        "click",
        function () {

          const record =
            aircraftRecords.find(
              function (
                item
              ) {

                return (
                  item.id ===
                  selectedRecordId
                );

              }
            );


          if (
            !record
          ) {

            return;

          }


          deleteAircraftName.textContent =
            record.airlineName +
            " - " +
            record.name +
            " (" +
            record.inputCode +
            ")";


          deleteModal
            .classList
            .remove("hidden");

        }
      );


      confirmDeleteBtn.addEventListener(
        "click",
        async function () {

          const icao =
            normaliseCode(
              originalAirlineIcao.value
            );


          const aircraftCode =
            normaliseCode(
              originalAircraftCode.value
            );


          if (
            !icao ||
            !aircraftCode
          ) {

            return;

          }


          confirmDeleteBtn.disabled =
            true;


          confirmDeleteBtn.textContent =
            "Deleting...";


          updateStatus(
            "Deleting aircraft..."
          );


          try {

            await database
              .ref(
                "aircraftTypes/" +
                icao +
                "/aircraft/" +
                aircraftCode
              )
              .remove();


            await cleanupOldAirline(
              icao
            );


            deleteModal
              .classList
              .add("hidden");


            hideAircraftForm();


            updateStatus(
              "Aircraft deleted"
            );

          }

          catch (
            error
          ) {

            console.error(
              error
            );


            setMessage(
              "Unable to delete aircraft. Check Firebase rules.",
              "error"
            );


            updateStatus(
              "Delete failed"
            );

          }

          finally {

            confirmDeleteBtn.disabled =
              false;


            confirmDeleteBtn.textContent =
              "Yes";

          }

        }
      );


      function closeDeleteModal() {

        deleteModal
          .classList
          .add("hidden");

      }


      cancelDeleteBtn.addEventListener(
        "click",
        closeDeleteModal
      );


      modalCloseBtn.addEventListener(
        "click",
        closeDeleteModal
      );


      deleteModal.addEventListener(
        "click",
        function (
          event
        ) {

          if (
            event.target ===
            deleteModal
          ) {

            closeDeleteModal();

          }

        }
      );


      aircraftSearch.addEventListener(
        "input",
        function () {

          clearSearchBtn
            .classList
            .toggle(
              "hidden",
              !aircraftSearch.value
            );


          renderTable();

        }
      );


      clearSearchBtn.addEventListener(
        "click",
        function () {

          aircraftSearch.value =
            "";


          clearSearchBtn
            .classList
            .add("hidden");


          renderTable();


          aircraftSearch.focus();

        }
      );


      airlineFilter.addEventListener(
        "change",
        renderTable
      );


      sortSelect.addEventListener(
        "change",
        renderTable
      );


      document.addEventListener(
        "keydown",
        function (
          event
        ) {

          if (
            event.key ===
            "Escape"
          ) {

            if (
              !deleteModal
                .classList
                .contains("hidden")
            ) {

              closeDeleteModal();

              return;

            }


            if (
              !aircraftEditor
                .classList
                .contains("hidden")
            ) {

              hideAircraftForm();

            }

          }

        }
      );


      database
        .ref(
          ".info/connected"
        )
        .on(
          "value",
          function (
            snapshot
          ) {

            const connected =
              snapshot.val() ===
              true;


            connectionStatus
              .classList
              .remove(
                "connected",
                "disconnected"
              );


            if (
              connected
            ) {

              connectionStatus
                .classList
                .add(
                  "connected"
                );


              connectionText.textContent =
                "Database Connected";

            }

            else {

              connectionStatus
                .classList
                .add(
                  "disconnected"
                );


              connectionText.textContent =
                "Database Disconnected";

            }

          }
        );


      updatePreview();

      updateStatus(
        "Ready"
      );

    });
