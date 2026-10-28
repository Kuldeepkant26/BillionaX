import { listEnquiries, newEnquiryCount, updateEnquiry } from "../../api/admin.api.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Card, ErrorState, Pagination, Select, Table } from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { formatDateTime } from "../../utils/format.js";

/**
 * Hotels asking to join the network, from the landing page's partner form.
 *
 * A lead list, worked by phone: the page's only action is moving an enquiry
 * along — New, Contacted, Closed. The nav badge counts the New ones.
 */

const STATUSES = [
  ["NEW", "New"],
  ["CONTACTED", "Contacted"],
  ["CLOSED", "Closed"],
];

const ROOMS = {
  "1-25": "Up to 25 rooms",
  "26-75": "26–75 rooms",
  "76-150": "76–150 rooms",
  "150+": "150+ rooms",
};

const AdminEnquiriesPage = () => {
  const toastError = useAppStore((s) => s.toastError);
  const setEnquiriesNew = useAppStore((s) => s.setEnquiriesNew);

  // Opens on the New queue: that is the work. "All" is one click away.
  const list = usePaginatedList(listEnquiries, { limit: 25, filters: { status: "NEW" } });
  const { loading, error, run } = list;

  const move = async (enquiry, status) => {
    try {
      await updateEnquiry(enquiry._id, { status });
      run();
      // The badge counts New, which this change just moved.
      newEnquiryCount()
        .then((data) => setEnquiriesNew(data?.count))
        .catch(() => {});
    } catch (err) {
      toastError(err.message);
    }
  };

  return (
    <div>
      <PageHead
        title="Enquiries"
        subtitle="Hotels asking to join, from the partner form on the website"
        actions={
          <Select
            value={list.filters.status || ""}
            onChange={(e) => list.setFilter("status", e.target.value)}
            aria-label="Show enquiries"
            className="min-w-[150px]"
          >
            <option value="">All enquiries</option>
            {STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        }
      />

      <Card>
        {error ? (
          <ErrorState error={error} onRetry={run} />
        ) : (
          <>
            <Table
              loading={loading}
              columns={[
                { label: "Received" },
                { label: "Hotel" },
                { label: "Contact" },
                { label: "Message" },
                { label: "Status" },
              ]}
              rows={list.items}
              empty={{
                title: list.filters.status === "NEW" ? "No new enquiries" : "No enquiries",
                hint: "Enquiries arrive from the “For hotels” form on the website.",
              }}
              renderRow={(e) => (
                <tr key={e._id}>
                  <td className="whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                  <td>
                    <b>{e.hotelName}</b>
                    <span className="block text-[11.5px] text-muted">
                      {e.city}
                      {e.rooms ? ` · ${ROOMS[e.rooms] || e.rooms}` : ""}
                    </span>
                  </td>
                  <td>
                    {e.name}
                    <a href={`mailto:${e.email}`} className="block text-[11.5px] text-muted underline">
                      {e.email}
                    </a>
                    <a href={`tel:${e.phone.replace(/[^\d+]/g, "")}`} className="block text-[11.5px] text-muted">
                      {e.phone}
                    </a>
                  </td>
                  <td className="max-w-[340px]">
                    {e.message ? (
                      <span className="block whitespace-pre-line text-[12.5px] leading-[1.5]">{e.message}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <Select
                      value={e.status}
                      onChange={(ev) => move(e, ev.target.value)}
                      aria-label={`Status of ${e.hotelName}`}
                      className="min-w-[130px]"
                    >
                      {STATUSES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    {e.statusChangedBy?.name && (
                      <span className="mt-1 block text-[10.5px] text-muted">by {e.statusChangedBy.name}</span>
                    )}
                  </td>
                </tr>
              )}
            />
            <Pagination
              page={list.page}
              limit={list.limit}
              total={list.total}
              onPage={list.setPage}
              loading={loading}
            />
          </>
        )}
      </Card>
    </div>
  );
};

export default AdminEnquiriesPage;
